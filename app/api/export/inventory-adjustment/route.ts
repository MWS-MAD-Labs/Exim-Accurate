import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { exportInventoryAdjustments } from "@/lib/accurate/inventory";
import { refreshSession, refreshAccessToken } from "@/lib/accurate/client";
import { getResourceCredential } from "@/lib/credential-access";
import {
  exportToCSV,
  exportToXLSX,
  exportToJSON,
} from "@/lib/export/exporters";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { credentialId, startDate, endDate, format } = body;

    if (!credentialId || !startDate || !endDate || !format) {
      return NextResponse.json(
        { error: "Kolom wajib belum lengkap" },
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
      console.log("[export] Refreshing access token...");
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
        console.error("[export] Token refresh failed:", tokenError.message);
        return NextResponse.json(
          { error: "Sesi kedaluwarsa. Silakan hubungkan ulang ke Accurate." },
          { status: 401 }
        );
      }
    }

    // Refresh session before making API calls
    console.log("[export] Refreshing session before API calls...");
    const { session: freshSession, host: freshHost } = await refreshSession(
      currentAccessToken,
      credential.dbId
    );

    // Update the credential with fresh session
    await prisma.accurateCredentials.update({
      where: { id: credential.id },
      data: { session: freshSession, host: freshHost },
    });

    // Create export job
    const exportJob = await prisma.exportJob.create({
      data: {
        userId: session.user.id,
        credentialId: credential.id,
        type: "inventory_adjustment",
        status: "running",
        format,
      },
    });

    try {
      // Export data from Accurate with fresh tokens and session
      const records = await exportInventoryAdjustments(
        {
          apiToken: currentAccessToken,
          signatureSecret: credential.signatureSecret,
          host: freshHost,
          session: freshSession,
        },
        startDate,
        endDate,
      );

      // Generate file based on format
      let fileContent: Buffer | string;
      let contentType: string;
      let extension: string;

      if (format === "csv") {
        fileContent = exportToCSV(records);
        contentType = "text/csv";
        extension = "csv";
      } else if (format === "xlsx") {
        fileContent = await exportToXLSX(records);
        contentType =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        extension = "xlsx";
      } else if (format === "json") {
        fileContent = exportToJSON(records);
        contentType = "application/json";
        extension = "json";
      } else {
        throw new Error("Format tidak valid");
      }

      // Update export job
      await prisma.exportJob.update({
        where: { id: exportJob.id },
        data: {
          status: "done",
          completedAt: new Date(),
          recordCount: records.length,
        },
      });

      // Return file
      const filename = `inventory-adjustment-${startDate}-to-${endDate}.${extension}`;

      return new NextResponse(fileContent as BodyInit, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } catch (err: any) {
      // Update export job on error
      await prisma.exportJob.update({
        where: { id: exportJob.id },
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
