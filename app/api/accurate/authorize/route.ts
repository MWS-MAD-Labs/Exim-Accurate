import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBaseUrl } from "@/lib/url";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    const baseUrl = getBaseUrl(req);
    return NextResponse.redirect(
      new URL("/login?callbackUrl=/dashboard/credentials", baseUrl)
    );
  }

  const clientId = process.env.ACCURATE_CLIENT_ID;
  const redirectUri = process.env.ACCURATE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Accurate OAuth is not configured" },
      { status: 500 }
    );
  }

  // Scopes required by inventory adjustment and POS product synchronization.
  const scopes = [
    "item_adjustment_view",
    "item_adjustment_save",
    "item_adjustment_delete",
    "item_view",
    "item_save",
    "warehouse_view",
    "unit_view",
  ].join(" ");

  const authorizeUrl = new URL("https://account.accurate.id/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", scopes);

  const credentialId = req.nextUrl.searchParams.get("credentialId");
  if (credentialId) {
    const credential = await prisma.accurateCredentials.findFirst({
      where: { id: credentialId, userId: session.user.id },
      select: { id: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    authorizeUrl.searchParams.set("state", credential.id);
  }

  return NextResponse.redirect(authorizeUrl.toString());
}
