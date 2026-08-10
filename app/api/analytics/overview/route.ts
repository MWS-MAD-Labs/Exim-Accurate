import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapToRankedRows, parseAnalyticsFilters, serializeFilters, trendKey } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const filters = await parseAnalyticsFilters(req, session.user.id);
    const borrowingWhere: any = {
      borrowedAt: { gte: filters.startDate, lte: filters.endDate },
      credential: { organizationId: filters.organizationId },
    };
    const checkoutWhere: any = {
      createdAt: { gte: filters.startDate, lte: filters.endDate },
      credential: { organizationId: filters.organizationId },
    };
    if (filters.credentialId) {
      borrowingWhere.credentialId = filters.credentialId;
      checkoutWhere.credentialId = filters.credentialId;
    }

    const [borrowingRows, checkoutRows] = await Promise.all([
      prisma.borrowingSession.findMany({ where: borrowingWhere, include: { items: true } }),
      prisma.checkoutSession.findMany({ where: checkoutWhere, include: { items: true } }),
    ]);

    const peminjamanQuantity = borrowingRows.reduce(
      (sum, row) => sum + row.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const pengambilanQuantity = checkoutRows.reduce(
      (sum, row) => sum + row.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const returnedQuantity = borrowingRows.reduce(
      (sum, row) => sum + row.items.reduce((itemSum, item) => itemSum + item.returnedQty, 0),
      0,
    );

    const trendMap = new Map<string, { peminjaman: number; pengambilan: number }>();
    const resourceMap = new Map<string, { total: number; data: { itemCode: string; itemName: string } }>();
    const userMap = new Map<string, { total: number; data: { email: string; name: string | null; source: string } }>();

    for (const row of borrowingRows) {
      const key = trendKey(row.borrowedAt, filters.groupBy);
      const trend = trendMap.get(key) || { peminjaman: 0, pengambilan: 0 };
      const quantity = row.items.reduce((sum, item) => sum + item.quantity, 0);
      trend.peminjaman += quantity;
      trendMap.set(key, trend);

      const user = userMap.get(row.borrowerEmail) || {
        total: 0,
        data: { email: row.borrowerEmail, name: row.borrowerName, source: "peminjaman" },
      };
      user.total += quantity;
      userMap.set(row.borrowerEmail, user);

      for (const item of row.items) {
        const resource = resourceMap.get(item.itemCode) || {
          total: 0,
          data: { itemCode: item.itemCode, itemName: item.itemName },
        };
        resource.total += item.quantity;
        resourceMap.set(item.itemCode, resource);
      }
    }

    for (const row of checkoutRows) {
      const key = trendKey(row.createdAt, filters.groupBy);
      const trend = trendMap.get(key) || { peminjaman: 0, pengambilan: 0 };
      const quantity = row.items.reduce((sum, item) => sum + item.quantity, 0);
      trend.pengambilan += quantity;
      trendMap.set(key, trend);

      const user = userMap.get(row.staffEmail) || {
        total: 0,
        data: { email: row.staffEmail, name: row.staffName, source: "pengambilan" },
      };
      user.total += quantity;
      userMap.set(row.staffEmail, user);

      for (const item of row.items) {
        const resource = resourceMap.get(item.itemCode) || {
          total: 0,
          data: { itemCode: item.itemCode, itemName: item.itemName || item.itemCode },
        };
        resource.total += item.quantity;
        resourceMap.set(item.itemCode, resource);
      }
    }

    return NextResponse.json({
      filters: serializeFilters(filters),
      peminjamanSummary: {
        sessions: borrowingRows.length,
        quantity: peminjamanQuantity,
        active: borrowingRows.filter((row) => row.status === "active").length,
        overdue: borrowingRows.filter(
          (row) => ["active", "partial"].includes(row.status) && row.dueAt && row.dueAt < new Date(),
        ).length,
        returnedQuantity,
      },
      pengambilanSummary: {
        sessions: checkoutRows.length,
        quantity: pengambilanQuantity,
        completed: checkoutRows.filter((row) => row.status === "completed").length,
        failed: checkoutRows.filter((row) => row.status === "failed").length,
      },
      resourceSummary: {
        uniqueResources: resourceMap.size,
        totalUsage: peminjamanQuantity + pengambilanQuantity,
      },
      trends: Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, values]) => ({ name, ...values })),
      topResources: mapToRankedRows(resourceMap),
      topUsers: mapToRankedRows(userMap),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memuat analytics overview";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
