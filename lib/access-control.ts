import type { UserRole } from "@/lib/user-roles";

export type AppRole = UserRole;

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/dashboard",
  resource: "/dashboard/peminjaman",
  cashier: "/pos-cashier",
  staff: "/store",
};

export function isRoleAllowed(role: string | null | undefined, allowed: AppRole[]) {
  return !!role && allowed.includes(role as AppRole);
}

export function getRoleHome(role: string | null | undefined) {
  return ROLE_HOME[role as AppRole] || "/login";
}

export function canAccessResourceManagement(role: string | null | undefined) {
  return isRoleAllowed(role, ["admin", "resource"]);
}

export function canOperatePos(role: string | null | undefined) {
  return isRoleAllowed(role, ["admin", "cashier"]);
}

export function canBrowsePosCatalog(role: string | null | undefined) {
  return isRoleAllowed(role, ["admin", "cashier", "staff"]);
}

export function canUseStaffStore(role: string | null | undefined) {
  return isRoleAllowed(role, ["admin", "staff"]);
}
