import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  mapToRankedRows,
  paginate,
  parseAnalyticsFilters,
  serializeFilters,
  sumBy,
  trendKey,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  try {
    const filters = await parseAnalyticsFilters(req, session.user.id);
    const { searchParams } = new URL(req.url);
    const exactItemCode = searchParams.get("exactItemCode") === "true";
    const where: any = {
      createdAt: { gte: filters.startDate, lte: filters.endDate },
      credential: { organizationId: filters.organizationId },
    };

    if (filters.credentialId) where.credentialId = filters.credentialId;
    if (filters.email)
      where.staffEmail = { contains: filters.email, mode: "insensitive" };
    if (filters.status) where.status = filters.status;

    const itemWhere = filters.itemCode
      ? {
          OR: exactItemCode
            ? [{ itemCode: filters.itemCode }]
            : [
                {
                  itemCode: { contains: filters.itemCode, mode: "insensitive" },
                },
                {
                  itemName: { contains: filters.itemCode, mode: "insensitive" },
                },
              ],
        }
      : undefined;

    if (itemWhere) {
      where.items = { some: itemWhere };
    }

    const rows = (await prisma.checkoutSession.findMany({
      where,
      include: { items: itemWhere ? { where: itemWhere as any } : true },
      orderBy: { createdAt: "desc" },
    })) as any[];

    const totalQuantity = rows.reduce(
      (sum, row) =>
        sum +
        row.items.reduce(
          (itemSum: number, item: any) => itemSum + item.quantity,
          0,
        ),
      0,
    );

    const summary = {
      totalSessions: rows.length,
      completed: rows.filter((row) => row.status === "completed").length,
      pending: rows.filter((row) => row.status === "pending").length,
      failed: rows.filter((row) => row.status === "failed").length,
      uniqueStaff: new Set(rows.map((row) => row.staffEmail)).size,
      totalQuantity,
    };

    const trendMap = new Map<string, number>();
    for (const row of rows) {
      const quantity = row.items.reduce(
        (sum: number, item: any) => sum + item.quantity,
        0,
      );
      const key = trendKey(row.createdAt, filters.groupBy);
      trendMap.set(key, (trendMap.get(key) || 0) + quantity);
    }

    const itemMap = new Map<
      string,
      { total: number; data: { itemCode: string; itemName: string } }
    >();
    const staffMap = new Map<
      string,
      { total: number; data: { email: string; name: string | null } }
    >();

    for (const row of rows) {
      const sessionQuantity = row.items.reduce(
        (sum: number, item: any) => sum + item.quantity,
        0,
      );
      const staff = staffMap.get(row.staffEmail) || {
        total: 0,
        data: { email: row.staffEmail, name: row.staffName },
      };
      staff.total += sessionQuantity;
      staffMap.set(row.staffEmail, staff);

      for (const item of row.items) {
        const entry = itemMap.get(item.itemCode) || {
          total: 0,
          data: {
            itemCode: item.itemCode,
            itemName: item.itemName || item.itemCode,
          },
        };
        entry.total += item.quantity;
        itemMap.set(item.itemCode, entry);
      }
    }

    const details = rows.flatMap((row) =>
      row.items.map((item: any) => ({
        createdAt: row.createdAt,
        completedAt: row.completedAt,
        status: row.status,
        staffEmail: row.staffEmail,
        staffName: row.staffName,
        itemCode: item.itemCode,
        itemName: item.itemName || item.itemCode,
        quantity: item.quantity,
        errorMessage: row.errorMessage,
        adjustmentId: row.adjustmentId,
      })),
    );

    return NextResponse.json({
      filters: serializeFilters(filters),
      summary,
      trend: Array.from(trendMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, checkouts]) => ({ name, checkouts })),
      statusBreakdown: sumBy(
        rows,
        (row) => row.status,
        () => 1,
      ),
      topItems: mapToRankedRows(itemMap),
      topStaff: mapToRankedRows(staffMap),
      failures: rows
        .filter((row) => row.status === "failed")
        .map((row) => ({
          sessionId: row.id,
          createdAt: row.createdAt,
          staffEmail: row.staffEmail,
          staffName: row.staffName,
          errorMessage: row.errorMessage,
        })),
      details: paginate(details, filters.page, filters.pageSize),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Gagal memuat analytics pengambilan";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
