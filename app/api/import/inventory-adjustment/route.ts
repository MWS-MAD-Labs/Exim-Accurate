import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, parseXLSX } from "@/lib/import/parser";
import { validateImportRows } from "@/lib/import/validator";
import { saveInventoryAdjustment } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { getResourceCredential } from "@/lib/credential-access";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const credentialId = formData.get("credentialId") as string;
    const useAutoNumbering = formData.get("useAutoNumbering") === "true";

    if (!file || !credentialId) {
      return NextResponse.json(
        { error: "File dan ID kredensial wajib diisi" },
        { status: 400 },
      );
    }

    // Fetch credentials
    const credential = await getResourceCredential(session.user.role, credentialId);

    if (!credential || !credential.host || !credential.dbId) {
      return NextResponse.json(
        { error: "Kredensial tidak ditemukan atau belum dikonfigurasi dengan benar. Silakan hubungkan ulang ke Accurate." },
        { status: 404 },
      );
    }

    // Get client credentials from env
    const clientId = process.env.ACCURATE_CLIENT_ID;
    const clientSecret = process.env.ACCURATE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error("Variabel lingkungan ACCURATE_CLIENT_ID atau ACCURATE_CLIENT_SECRET belum diatur");
    }

    let currentAccessToken = credential.apiToken;
    let currentRefreshToken = credential.refreshToken;

    // Refresh access token if we have a refresh token
    if (currentRefreshToken) {
      console.log("[import] Refreshing access token...");
      try {
        const { accessToken, refreshToken: newRefreshToken } = await refreshAccessToken(
          currentRefreshToken,
          clientId,
          clientSecret
        );
        currentAccessToken = accessToken;
        if (newRefreshToken) {
          currentRefreshToken = newRefreshToken;
        }

        // Update the credential with new tokens
        await prisma.accurateCredentials.update({
          where: { id: credential.id },
          data: {
            apiToken: currentAccessToken,
            refreshToken: currentRefreshToken,
          },
        });
      } catch (tokenError: any) {
        console.error("[import] Token refresh failed:", tokenError.message);
        return NextResponse.json(
          { error: "Sesi kedaluwarsa. Silakan hubungkan ulang ke Accurate." },
          { status: 401 }
        );
      }
    }

    // Refresh session before making API calls
    console.log("[import] Refreshing session before API calls...");
    const { session: freshSession, host: freshHost } = await refreshSession(
      currentAccessToken,
      credential.dbId
    );

    // Update the credential with fresh session
    await prisma.accurateCredentials.update({
      where: { id: credential.id },
      data: { session: freshSession, host: freshHost },
    });

    // Parse file based on extension
    const fileName = file.name.toLowerCase();
    const format = fileName.endsWith(".csv") ? "csv" : "xlsx";
    let rows;

    if (format === "csv") {
      const content = await file.text();
      rows = await parseCSV(content);
    } else if (format === "xlsx") {
      const buffer = await file.arrayBuffer();
      rows = await parseXLSX(buffer);
    } else {
      return NextResponse.json(
        { error: "Format file tidak didukung. Gunakan CSV atau XLSX" },
        { status: 400 },
      );
    }

    // Validate rows first
    const validationResult = await validateImportRows(rows, {
      apiToken: currentAccessToken,
      signatureSecret: credential.signatureSecret,
      host: freshHost,
      session: freshSession,
    });

    if (!validationResult.valid) {
      return NextResponse.json(
        { error: "Validasi gagal", errors: validationResult.errors },
        { status: 400 },
      );
    }

    // Create import job
    const importJob = await prisma.importJob.create({
      data: {
        userId: session.user.id,
        credentialId: credential.id,
        type: "inventory_adjustment",
        status: "running",
        format,
        fileName: file.name,
        recordCount: rows.length,
      },
    });

    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      // Group rows by date and reference number
      const groupedRows = new Map<string, typeof rows>();

      for (const row of rows) {
        const key = `${row.adjustmentDate}_${row.referenceNumber || "none"}`;
        if (!groupedRows.has(key)) {
          groupedRows.set(key, []);
        }
        groupedRows.get(key)!.push(row);
      }

      // Import each group as a separate adjustment
      for (const [key, groupRows] of groupedRows.entries()) {
        try {
          // Build detail items for saveInventoryAdjustment
          const detailItems = groupRows.map((row) => {
            // Map "Penambahan" -> "ADJUSTMENT_IN", everything else -> "ADJUSTMENT_OUT"
            const itemAdjustmentType = row.type.toLowerCase().includes("tambah") ||
              row.type.toLowerCase() === "add" ||
              row.type.toLowerCase() === "penambahan"
              ? ("ADJUSTMENT_IN" as const)
              : ("ADJUSTMENT_OUT" as const);

            return {
              itemNo: row.itemCode,
              quantity: row.quantity,
              itemAdjustmentType,
              warehouseName: row.warehouse,
            };
          });

          // Save to Accurate
          await saveInventoryAdjustment(
            {
              apiToken: currentAccessToken,
              signatureSecret: credential.signatureSecret,
              host: freshHost,
              session: freshSession,
            },
            {
              transDate: groupRows[0].adjustmentDate,
              number: useAutoNumbering ? undefined : groupRows[0].referenceNumber,
              description: groupRows[0].description,
              detailItem: detailItems,
            },
          );

          successCount++;
        } catch (err: any) {
          failedCount++;
          errors.push(`Failed to import group ${key}: ${err.message}`);
        }
      }

      // Update import job
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: failedCount === 0 ? "done" : "error",
          completedAt: new Date(),
          errorMessage: errors.length > 0 ? errors.join("; ") : null,
          successCount,
          failedCount,
        },
      });

      return NextResponse.json({
        success: failedCount === 0,
        successCount,
        failedCount,
        errors,
      });
    } catch (err: any) {
      // Update import job on error
      await prisma.importJob.update({
        where: { id: importJob.id },
        data: {
          status: "error",
          errorMessage: err.message,
          completedAt: new Date(),
        },
      });
      throw err;
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Kesalahan server internal" },
      { status: 500 },
    );
  }
}
