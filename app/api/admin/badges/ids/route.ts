import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { BADGE_IDS_LIMIT, badgeHolderWhere } from "@/lib/badge-list";
import { prisma } from "@/lib/prisma";

// Everyone that matches a search, as ids only, for "select all".
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const where = badgeHolderWhere(admin.organizationId, new URL(request.url).searchParams.get("search") ?? "");
  const rows = await prisma.user.findMany({
    where,
    select: { id: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: BADGE_IDS_LIMIT,
  });
  return NextResponse.json({ ids: rows.map((row) => row.id) }, { headers: { "Cache-Control": "private, no-store" } });
}
