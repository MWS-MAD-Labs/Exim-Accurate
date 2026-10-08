import type { UserRole } from "@/lib/user-roles";

export type AppRole = UserRole;

export const APP_PERMISSIONS = [
  "app.admin",
  "dashboard.read",
  "analytics.read",
  "users.manage",
  "credentials.read",
  "credentials.manage",
  "accurate.manage",
  "inventory.export",
  "inventory.import",
  "borrowing.manage",
  "pos.catalog.read",
  "pos.manage",
  "pos.checkout",
  "pos.sales.read",
  "pos.sales.void",
  "allowance.manage",
  "allowance.collect",
  "store.use",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

// What Central shows next to each permission. `requires` keeps a role from carrying a
// permission without the ones it cannot work without. Sent with `npm run permissions:sync`.
export const APP_PERMISSION_DETAILS: Record<
  AppPermission,
  { description: string; requires?: AppPermission[] }
> = {
  "app.admin": {
    description: "Open the admin tools of Exima",
    requires: ["dashboard.read"],
  },
  "dashboard.read": { description: "Open the dashboard" },
  "analytics.read": {
    description: "See analytics",
    requires: ["dashboard.read"],
  },
  "users.manage": {
    description: "Manage Exima users",
    requires: ["dashboard.read"],
  },
  "credentials.read": { description: "See Accurate credentials" },
  "credentials.manage": {
    description: "Add, edit and remove Accurate credentials",
    requires: ["credentials.read"],
  },
  "accurate.manage": {
    description: "Manage the Accurate connection",
    requires: ["credentials.read"],
  },
  "inventory.export": { description: "Export inventory adjustments" },
  "inventory.import": { description: "Import inventory adjustments" },
  "borrowing.manage": { description: "Manage item borrowing" },
  "pos.catalog.read": { description: "Browse the POS catalog" },
  "pos.manage": {
    description: "Manage POS settings and catalog",
    requires: ["pos.catalog.read"],
  },
  "pos.checkout": {
    description: "Run the cashier checkout and manage reservations",
    requires: ["pos.catalog.read"],
  },
  "pos.sales.read": {
    description: "See POS sales",
    requires: ["pos.catalog.read"],
  },
  "pos.sales.void": {
    description: "Void POS sales",
    requires: ["pos.sales.read"],
  },
  "allowance.manage": {
    description: "Manage staff allowances",
    requires: ["allowance.collect"],
  },
  "allowance.collect": { description: "Collect allowance payments" },
  "store.use": { description: "Use the staff store" },
};

export const PERMISSION_MANIFEST = APP_PERMISSIONS.map((key) => ({
  key,
  ...APP_PERMISSION_DETAILS[key],
}));

export const ROLE_PERMISSIONS: Record<AppRole, AppPermission[]> = {
  admin: [...APP_PERMISSIONS],
  resource: [
    "credentials.read",
    "inventory.export",
    "inventory.import",
    "borrowing.manage",
  ],
  cashier: [
    "credentials.read",
    "pos.catalog.read",
    "pos.checkout",
    "pos.sales.read",
    "allowance.collect",
  ],
  staff: ["credentials.read", "pos.catalog.read", "store.use"],
};

export const ROLE_HOME: Record<AppRole, string> = {
  admin: "/dashboard",
  resource: "/dashboard/peminjaman",
  cashier: "/pos-cashier",
  staff: "/store",
};

export function isAppPermission(value: string): value is AppPermission {
  return (APP_PERMISSIONS as readonly string[]).includes(value);
}

export function normalizePermissions(values: readonly string[]) {
  return Array.from(new Set(values.filter(isAppPermission)));
}

export function hasPermission(
  permissions: readonly string[] | null | undefined,
  permission: AppPermission,
) {
  return Boolean(permissions?.includes(permission));
}

export function hasAnyPermission(
  permissions: readonly string[] | null | undefined,
  required: readonly AppPermission[],
) {
  return required.some((permission) => hasPermission(permissions, permission));
}

export function isRoleAllowed(
  role: string | null | undefined,
  allowed: AppRole[],
) {
  return !!role && allowed.includes(role as AppRole);
}

export function getRoleHome(
  role: string | null | undefined,
  permissions?: readonly string[] | null,
) {
  if (permissions?.length) {
    const home = getPermissionHome(permissions);
    if (home !== "/login") return home;
  }
  return ROLE_HOME[role as AppRole] || "/login";
}

export function getPermissionHome(
  permissions: readonly string[] | null | undefined,
) {
  if (hasPermission(permissions, "dashboard.read")) return "/dashboard";
  if (hasPermission(permissions, "borrowing.manage"))
    return "/dashboard/peminjaman";
  if (hasPermission(permissions, "pos.checkout")) return "/pos-cashier";
  if (hasPermission(permissions, "store.use")) return "/store";
  return "/login";
}

export function canAccessResourceManagement(
  role: string | null | undefined,
  permissions?: readonly string[],
) {
  return permissions
    ? hasPermission(permissions, "borrowing.manage")
    : isRoleAllowed(role, ["admin", "resource"]);
}

export function canOperatePos(
  role: string | null | undefined,
  permissions?: readonly string[],
) {
  return permissions
    ? hasPermission(permissions, "pos.checkout")
    : isRoleAllowed(role, ["admin", "cashier"]);
}

export function canBrowsePosCatalog(
  role: string | null | undefined,
  permissions?: readonly string[],
) {
  return permissions
    ? hasPermission(permissions, "pos.catalog.read")
    : isRoleAllowed(role, ["admin", "cashier", "staff"]);
}

export function canUseStaffStore(
  role: string | null | undefined,
  permissions?: readonly string[],
) {
  return permissions
    ? hasPermission(permissions, "store.use")
    : isRoleAllowed(role, ["admin", "staff"]);
}
