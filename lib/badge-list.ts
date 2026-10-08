import type { Prisma } from "@prisma/client";

export const BADGE_PAGE_SIZES = [25, 50, 100] as const;
export const BADGE_PRINT_CHUNK = 100;
export const BADGE_IDS_LIMIT = 2000;

export function parseBadgePageSize(raw: string | null): (typeof BADGE_PAGE_SIZES)[number] {
  const value = Number(raw);
  return (BADGE_PAGE_SIZES as readonly number[]).includes(value) ? (value as (typeof BADGE_PAGE_SIZES)[number]) : 25;
}

// Who can have a badge: people with a Central identity who still have access to Exima.
export function badgeHolderWhere(organizationId: string, search = ""): Prisma.UserWhereInput {
  const term = search.trim().slice(0, 100);
  return {
    organizationId,
    centralPersonId: { not: null },
    centralStatus: "active",
    NOT: { permissions: { isEmpty: true } },
    ...(term
      ? { OR: [{ email: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }] }
      : {}),
  };
}
