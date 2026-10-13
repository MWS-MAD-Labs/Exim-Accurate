export const USER_ROLES = ["admin", "cashier", "resource", "staff"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "staff";

export const USER_ROLE_META: Record<
  UserRole,
  { label: string; description: string; color: string }
> = {
  admin: {
    label: "Admin",
    description: "Full access, including user and system management.",
    color: "red",
  },
  cashier: {
    label: "Cashier",
    description: "Operates the point-of-sale cashier workflow.",
    color: "green",
  },
  resource: {
    label: "Resource",
    description: "Manages inventory, borrowing, and operational resources.",
    color: "blue",
  },
  staff: {
    label: "Staff",
    description: "Standard access for day-to-day staff workflows.",
    color: "gray",
  },
};

export function isUserRole(role: string): role is UserRole {
  return USER_ROLES.includes(role as UserRole);
}

export type RoleTone = { label: string; description: string; color: string; icon: "shield" | "cash" | "tool" | "user" };

const ICON_OF: Record<UserRole, RoleTone["icon"]> = { admin: "shield", cashier: "cash", resource: "tool", staff: "user" };

// "super_admin" becomes "Super Admin".
export function roleLabel(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// How a role looks in a list. The four built in roles keep their colour. A role made in Central takes it from what it
// lets a person do, so one that can manage users is red like an admin, one that runs the till is green, and so on.
export function roleTone(role: string, permissions: readonly string[] | null | undefined = []): RoleTone {
  if (isUserRole(role)) return { ...USER_ROLE_META[role], icon: ICON_OF[role] };
  const has = (...wanted: string[]) => wanted.some((permission) => permissions?.includes(permission));
  const label = roleLabel(role);
  const description = "Role made in Central.";
  if (has("users.manage", "app.admin", "credentials.manage", "accurate.manage")) return { label, description, color: "red", icon: "shield" };
  if (has("pos.manage", "pos.checkout", "allowance.collect", "pos.sales.void")) return { label, description, color: "green", icon: "cash" };
  if (has("inventory.export", "inventory.import", "borrowing.manage")) return { label, description, color: "blue", icon: "tool" };
  return { label, description, color: "gray", icon: "user" };
}
