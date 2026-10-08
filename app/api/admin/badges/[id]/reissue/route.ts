import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

// Cancels every badge of this person made so far. Their next badge shows on My Badge.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, select: { organizationId: true, email: true } });
  if (!target || target.organizationId !== admin.organizationId) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { badgeVersion: { increment: 1 } },
    select: { badgeVersion: true },
  });
  console.info("[badge] Reissued", { by: admin.email, for: target.email, version: updated.badgeVersion });
  return NextResponse.json({ version: updated.badgeVersion });
}
