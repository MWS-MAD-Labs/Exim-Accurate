import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { badgeSecretConfigured, issueBadgeToken } from "@/lib/badge-token";
import { prisma } from "@/lib/prisma";
import { parseUserListQuery, userListWhere } from "@/lib/user-directory";

// The badges of the people of this organization, to print or to reissue.
export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (!badgeSecretConfigured()) {
    return NextResponse.json({ error: "EXIMA_BADGE_SECRET is not set. Set a secret of 16 characters or more." }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const query = parseUserListQuery(params);
  // Only people with access can use a badge.
  const where = { ...userListWhere(admin.organizationId, { ...query, role: null, status: "active" }), centralPersonId: { not: null } };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, centralPersonId: true, badgeVersion: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
  ]);

  return NextResponse.json(
    {
      badges: users.map((user) => ({
        id: user.id,
        name: user.name ?? user.email,
        email: user.email,
        version: user.badgeVersion,
        token: issueBadgeToken(user.centralPersonId as string, user.badgeVersion),
      })),
      paging: { page: query.page, size: query.size, total, totalPages: Math.max(Math.ceil(total / query.size), 1) },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
