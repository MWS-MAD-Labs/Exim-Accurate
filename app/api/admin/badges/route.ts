import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { badgeHolderWhere, parseBadgePageSize } from "@/lib/badge-list";
import { prisma } from "@/lib/prisma";

// The people who have a badge, a page at a time. No badge text here: that is asked for one person
// or one print job at a time.
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const size = parseBadgePageSize(params.get("size"));
  const page = Math.max(Number.parseInt(params.get("page") ?? "1", 10) || 1, 1);
  const where = badgeHolderWhere(admin.organizationId, params.get("search") ?? "");

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, badgeVersion: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (page - 1) * size,
      take: size,
    }),
  ]);

  return NextResponse.json(
    {
      badges: users.map((user) => ({ id: user.id, name: user.name ?? user.email, email: user.email, reissued: user.badgeVersion - 1 })),
      paging: { page, size, total, totalPages: Math.max(Math.ceil(total / size), 1) },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
