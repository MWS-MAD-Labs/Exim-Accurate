import { hasAnyPermission, hasPermission } from "@/lib/access-control";

// Which Accurate connections a person sees, from what their role lets them do and not from the name of the role.
//   all        everything, also the ones that were disconnected (manages credentials)
//   connected  the ones that are connected (works with inventory or borrowing)
//   store      the connected ones that have an active POS store (cashier and staff)
//   none       nothing
export type CredentialView = "all" | "connected" | "store" | "none";

export function credentialView(permissions: readonly string[] | null | undefined): CredentialView {
  if (hasPermission(permissions, "credentials.manage")) return "all";
  if (!hasPermission(permissions, "credentials.read")) return "none";
  if (hasAnyPermission(permissions, ["inventory.export", "inventory.import", "borrowing.manage"])) return "connected";
  return "store";
}

// A person with this sees the sales of everyone and may retry them. Everybody else only their own.
export function seesAllSales(permissions: readonly string[] | null | undefined): boolean {
  return hasPermission(permissions, "pos.manage");
}
