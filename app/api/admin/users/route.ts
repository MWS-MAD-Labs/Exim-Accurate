import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { parseUserListQuery, userListWhere, userStatus } from "@/lib/user-directory";

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const query = parseUserListQuery(new URL(request.url).searchParams);
  const where = userListWhere(admin.organizationId, query);

  const [total, users, roles, samples] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        centralPersonId: true,
        centralStatus: true,
        entitlementSyncedAt: true,
        _count: {
          select: {
            accurateCredentials: true,
            exportJobs: true,
            importJobs: true,
          },
        },
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      skip: (query.page - 1) * query.size,
      take: query.size,
    }),
    // The role cards and the filter count everyone in the organization, not only this page.
    prisma.user.groupBy({ by: ["role"], where: { organizationId: admin.organizationId }, _count: { _all: true } }),
    // What one person of each role can do, so a role made in Central gets its colour from that.
    prisma.user.findMany({ where: { organizationId: admin.organizationId }, distinct: ["role"], select: { role: true, permissions: true } }),
  ]);
  const permissionsOf = new Map(samples.map((row) => [row.role, row.permissions]));

  return NextResponse.json({
    users: users.map((user) => ({ ...user, status: userStatus(user) })),
    currentUserId: admin.id,
    paging: { page: query.page, size: query.size, total, totalPages: Math.max(Math.ceil(total / query.size), 1) },
    roles: roles.map((row) => ({ role: row.role, count: row._count._all, permissions: permissionsOf.get(row.role) ?? [] })).sort((a, b) => a.role.localeCompare(b.role)),
  });
}
