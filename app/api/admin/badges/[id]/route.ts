import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { badgeSecretConfigured, issueBadgeToken } from "@/lib/badge-token";
import { badgeHolderWhere } from "@/lib/badge-list";
import { prisma } from "@/lib/prisma";

// The badge of one person, for the preview.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (!badgeSecretConfigured()) {
    return NextResponse.json({ error: "EXIMA_BADGE_SECRET is not set. Set a secret of 16 characters or more." }, { status: 503 });
  }

  const { id } = await params;
  const user = await prisma.user.findFirst({
    where: { ...badgeHolderWhere(admin.organizationId), id },
    select: { name: true, email: true, centralPersonId: true, badgeVersion: true },
  });
  if (!user?.centralPersonId) return NextResponse.json({ error: "User not found or without access." }, { status: 404 });

  console.info("[badge] Shown to an admin", { by: admin.email, for: user.email });
  return NextResponse.json(
    { name: user.name ?? user.email, email: user.email, token: issueBadgeToken(user.centralPersonId, user.badgeVersion) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
