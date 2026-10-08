import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin";
import { BADGE_PRINT_CHUNK, badgeHolderWhere } from "@/lib/badge-list";
import { badgeSecretConfigured, issueBadgeToken } from "@/lib/badge-token";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(BADGE_PRINT_CHUNK) });

// The badge text of a group of people for a printed sheet, at most one chunk per call.
export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (!badgeSecretConfigured()) {
    return NextResponse.json({ error: "EXIMA_BADGE_SECRET is not set. Set a secret of 16 characters or more." }, { status: 503 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: `Send between 1 and ${BADGE_PRINT_CHUNK} ids.` }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    where: { ...badgeHolderWhere(admin.organizationId), id: { in: parsed.data.ids } },
    select: { id: true, name: true, email: true, centralPersonId: true, badgeVersion: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });
  console.info("[badge] Printed", { by: admin.email, count: users.length });
  return NextResponse.json(
    {
      badges: users.map((user) => ({
        id: user.id,
        name: user.name ?? user.email,
        email: user.email,
        token: issueBadgeToken(user.centralPersonId as string, user.badgeVersion),
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
