import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationIdForUser } from "@/lib/organization";

export type AnalyticsGroupBy = "day" | "week" | "month";

export interface AnalyticsFilters {
  startDate: Date;
  endDate: Date;
  organizationId: string;
  credentialId?: string;
  email?: string;
  itemCode?: string;
  status?: string;
  groupBy: AnalyticsGroupBy;
  page: number;
  pageSize: number;
}

export function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function endOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseDate(value: string | null, fallback: Date, endOfDay = false) {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Tanggal tidak valid: ${value}`);
  }
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed;
}

export async function parseAnalyticsFilters(
  req: NextRequest,
  userId: string,
): Promise<AnalyticsFilters> {
  const { searchParams } = new URL(req.url);
  const groupByParam = searchParams.get("groupBy") || "day";
  if (!["day", "week", "month"].includes(groupByParam)) {
    throw new Error("groupBy harus day, week, atau month");
  }

  const startDate = parseDate(searchParams.get("startDate"), startOfCurrentMonth());
  const endDate = parseDate(searchParams.get("endDate"), endOfCurrentMonth(), true);

  if (startDate > endDate) {
    throw new Error("startDate tidak boleh setelah endDate");
  }

  const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > maxRangeMs) {
    throw new Error("Rentang tanggal maksimal 1 tahun");
  }

  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) {
    throw new Error("Organisasi pengguna tidak ditemukan");
  }

  const credentialId = searchParams.get("credentialId") || undefined;
  if (credentialId) {
    const credential = await prisma.accurateCredentials.findFirst({
      where: { id: credentialId, organizationId },
      select: { id: true },
    });
    if (!credential) {
      throw new Error("Kredensial tidak ditemukan");
    }
  }

  return {
    startDate,
    endDate,
    organizationId,
    credentialId,
    email: searchParams.get("email") || undefined,
    itemCode: searchParams.get("itemCode") || undefined,
    status: searchParams.get("status") || undefined,
    groupBy: groupByParam as AnalyticsGroupBy,
    page: Math.max(1, Number(searchParams.get("page") || "1")),
    pageSize: Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "25"))),
  };
}

export function serializeFilters(filters: AnalyticsFilters) {
  const { organizationId: _organizationId, ...publicFilters } = filters;
  return {
    ...publicFilters,
    startDate: filters.startDate.toISOString(),
    endDate: filters.endDate.toISOString(),
  };
}

export function trendKey(date: Date, groupBy: AnalyticsGroupBy) {
  const d = new Date(date);
  if (groupBy === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (groupBy === "week") {
    const first = new Date(d.getFullYear(), 0, 1);
    const days = Math.floor((d.getTime() - first.getTime()) / 86400000);
    const week = Math.ceil((days + first.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return d.toISOString().slice(0, 10);
}

export function incrementMap(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

export function mapToRankedRows<T extends Record<string, unknown>>(
  map: Map<string, { total: number; data: T }>,
  take = 10,
) {
  return Array.from(map.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, take)
    .map((entry, index) => ({ rank: index + 1, ...entry.data, total: entry.total }));
}

export function countBy<T>(items: T[], getKey: (item: T) => string | null | undefined) {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    if (key) incrementMap(map, key);
  }
  return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
}

export function sumBy<T>(items: T[], getKey: (item: T) => string, getValue: (item: T) => number) {
  const map = new Map<string, number>();
  for (const item of items) incrementMap(map, getKey(item), getValue(item));
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));
}

export function buildDateWhere(filters: AnalyticsFilters, field: string) {
  return {
    [field]: {
      gte: filters.startDate,
      lte: filters.endDate,
    },
  };
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    total: items.length,
    page,
    pageSize,
    totalPages: Math.ceil(items.length / pageSize),
  };
}
