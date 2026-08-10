import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCSV, parseXLSX } from "@/lib/import/parser";
import { validateImportRows } from "@/lib/import/validator";
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

    if (!file || !credentialId) {
      return NextResponse.json(
        { error: "File dan ID kredensial wajib diisi" },
        { status: 400 },
      );
    }

    // Fetch credentials
    const credential = await getResourceCredential(session.user.id, session.user.role, credentialId);

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
      console.log("[validate] Refreshing access token...");
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
        console.error("[validate] Token refresh failed:", tokenError.message);
        return NextResponse.json(
          { error: "Sesi kedaluwarsa. Silakan hubungkan ulang ke Accurate." },
          { status: 401 }
        );
      }
    }

    // Refresh session before making API calls
    console.log("[validate] Refreshing session before API calls...");
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
    let rows;

    if (fileName.endsWith(".csv")) {
      const content = await file.text();
      rows = await parseCSV(content);
    } else if (fileName.endsWith(".xlsx")) {
      const buffer = await file.arrayBuffer();
      rows = await parseXLSX(buffer);
    } else {
      return NextResponse.json(
        { error: "Format file tidak didukung. Gunakan CSV atau XLSX" },
        { status: 400 },
      );
    }

    // Validate rows
    const validationResult = await validateImportRows(rows, {
      apiToken: currentAccessToken,
      signatureSecret: credential.signatureSecret,
      host: freshHost,
      session: freshSession,
    });

    // Format results for frontend
    const formattedResults = validationResult.results.map((result) => ({
      itemCode: result.row.itemCode,
      itemName: result.itemName || result.row.itemName,
      type: result.row.type,
      quantity: result.row.quantity,
      unit: result.row.unit,
      adjustmentDate: result.row.adjustmentDate,
      referenceNumber: result.row.referenceNumber,
      warehouse: result.row.warehouse,
      description: result.row.description,
      valid: result.valid,
      errors: result.errors,
    }));

    return NextResponse.json({
      valid: validationResult.valid,
      results: formattedResults,
      errors: validationResult.errors,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Kesalahan server internal" },
      { status: 500 },
    );
  }
}
