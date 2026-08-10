import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveHost } from "@/lib/accurate/client";
import { getBaseUrl } from "@/lib/url";
import { getOrganizationIdForUser } from "@/lib/organization";

function redirectWithStatus(req: NextRequest, search: string) {
  const baseUrl = getBaseUrl(req);
  return NextResponse.redirect(
    new URL(`/dashboard/credentials?${search}`, baseUrl),
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const baseUrl = getBaseUrl(req);
    return NextResponse.redirect(
      new URL("/login?callbackUrl=/dashboard/credentials", baseUrl),
    );
  }
  if (session.user.role !== "admin") {
    return redirectWithStatus(req, "status=error&message=Akses%20admin%20diperlukan");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const credentialId = searchParams.get("state");

  if (error) {
    return redirectWithStatus(
      req,
      `status=error&message=${encodeURIComponent(error)}`,
    );
  }

  if (!code) {
    return redirectWithStatus(
      req,
      "status=error&message=Kode%20otorisasi%20tidak%20ditemukan",
    );
  }

  const clientId = process.env.ACCURATE_CLIENT_ID;
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET;
  const redirectUri = process.env.ACCURATE_REDIRECT_URI;
  const appKey = process.env.ACCURATE_APP_KEY;
  const signatureSecret = process.env.ACCURATE_SIGNATURE_SECRET;

  if (
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    !appKey ||
    !signatureSecret
  ) {
    return redirectWithStatus(
      req,
      "status=error&message=Variabel%20lingkungan%20OAuth%20Accurate%20belum%20lengkap",
    );
  }

  try {
    // Use Basic Auth for client credentials as per OAuth 2.0 spec
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    const tokenResponse = await fetch(
      "https://account.accurate.id/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${credentials}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    if (!tokenResponse.ok) {
      const text = await tokenResponse.text();
      throw new Error(text || "Gagal menukar kode menjadi token");
    }

    const tokenJson = await tokenResponse.json();

    const apiToken =
      tokenJson.access_token || tokenJson.api_token || tokenJson.token;
    const refreshToken = tokenJson.refresh_token;

    if (!apiToken) {
      throw new Error("Token API tidak ditemukan pada respons token");
    }

    const {
      host,
      session: accurateSession,
      dbId,
    } = await resolveHost(apiToken);

    const credentialData = {
      appKey,
      signatureSecret,
      apiToken,
      refreshToken,
      host,
      session: accurateSession,
      dbId,
      disconnectedAt: null,
    };

    const organizationId = await getOrganizationIdForUser(session.user.id);
    if (!organizationId) {
      throw new Error("Organisasi pengguna tidak ditemukan");
    }

    const activeCredential = await prisma.accurateCredentials.findFirst({
      where: { organizationId, disconnectedAt: null },
    });
    const reconnectCredential = credentialId
      ? await prisma.accurateCredentials.findFirst({
          where: { id: credentialId, organizationId },
        })
      : null;

    if (credentialId && !reconnectCredential) {
      throw new Error("Kredensial Accurate yang akan dihubungkan ulang tidak ditemukan");
    }

    // The organization keeps one stable active credential. A new OAuth grant
    // replaces its tokens; a disconnected record is only reactivated when no
    // active credential exists.
    const targetCredential = activeCredential ?? reconnectCredential;
    if (targetCredential) {
      await prisma.accurateCredentials.update({
        where: { id: targetCredential.id },
        data: credentialData,
      });
    } else {
      await prisma.accurateCredentials.create({
        data: {
          organizationId,
          userId: session.user.id,
          ...credentialData,
        },
      });
    }

    return redirectWithStatus(req, "status=connected");
  } catch (error: unknown) {
    const errorName = error instanceof Error ? error.name : "UnknownError";
    console.error(`[accurate/callback] OAuth connection failed: ${errorName}`);
    return redirectWithStatus(
      req,
      "status=error&message=Gagal%20menyimpan%20koneksi%20Accurate.%20Silakan%20coba%20hubungkan%20kembali.",
    );
  }
}
