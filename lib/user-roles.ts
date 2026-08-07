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
