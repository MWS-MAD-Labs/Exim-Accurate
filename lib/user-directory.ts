import type { Prisma } from "@prisma/client";

export type UserStatus = "active" | "no_access" | "unknown";
export const USER_STATUSES: readonly UserStatus[] = ["active", "no_access", "unknown"];

// Where a person stands against Central as of the last sync. "no_access" is a person Central knows
// who has no access to Exima now; "unknown" is someone Central does not know, or an older local
// account with no Central identity. Central does not keep the history, so "removed" is not claimed.
export function userStatus(user: { centralPersonId: string | null; centralStatus: string | null; permissions: readonly string[] }): UserStatus {
  if (!user.centralPersonId) return "unknown";
  if (user.centralStatus === "no_access") return "no_access";
  if (user.centralStatus === "unknown") return "unknown";
  return user.permissions.length === 0 ? "no_access" : "active";
}

export function statusWhere(status: UserStatus): Prisma.UserWhereInput {
  if (status === "unknown") return { OR: [{ centralPersonId: null }, { centralStatus: "unknown" }] };
  if (status === "no_access") return { centralPersonId: { not: null }, centralStatus: "no_access" };
  return { centralPersonId: { not: null }, NOT: { permissions: { isEmpty: true } } };
}

export type UserListQuery = {
  page: number;
  size: number;
  search: string;
  role: string | null;
  status: UserStatus | null;
};

export function parseUserListQuery(params: URLSearchParams): UserListQuery {
  const number = (name: string, fallback: number, min: number, max: number) => {
    const raw = params.get(name);
    const value = raw === null || raw.trim() === "" ? NaN : Number(raw);
    return Number.isInteger(value) ? Math.min(Math.max(value, min), max) : fallback;
  };
  const status = params.get("status");
  return {
    page: number("page", 1, 1, 100_000),
    size: number("size", 20, 1, 100),
    search: (params.get("search") ?? "").trim().slice(0, 100),
    role: params.get("role")?.trim().toLowerCase() || null,
    status: USER_STATUSES.includes(status as UserStatus) ? (status as UserStatus) : null,
  };
}

export function userListWhere(organizationId: string, query: UserListQuery): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [];
  if (query.role) and.push({ role: query.role });
  if (query.status) and.push(statusWhere(query.status));
  if (query.search) {
    and.push({
      OR: [
        { email: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
      ],
    });
  }
  return { organizationId, ...(and.length ? { AND: and } : {}) };
}
