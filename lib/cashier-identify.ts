import type { BadgeRefusal } from "@/lib/badge-messages";
import { resolveBadgeWithCentral } from "@/lib/central-provision";
import { prisma } from "@/lib/prisma";
import type { BadgeResult } from "@/lib/staff-identity";

export type CashierIdentity =
  | { ok: true; personId: string; email: string; name: string | null }
  | { ok: false; reason: BadgeRefusal };

type Deps = {
  resolve: (raw: string) => Promise<BadgeResult>;
  member: (personId: string, organizationId: string) => Promise<{ name: string | null; email: string } | null>;
};

const defaults: Deps = {
  resolve: resolveBadgeWithCentral,
  member: (personId, organizationId) =>
    prisma.user.findFirst({
      where: { centralPersonId: personId, organizationId },
      select: { name: true, email: true },
    }),
};

// What the cashier's reader typed (a signed badge, or the email on a card) is turned into one
// person of the store's organization on the server, so the counter does not wait for a name list.
export async function identifyStaffForCashier(
  raw: string,
  organizationId: string,
  deps: Partial<Deps> = {},
): Promise<CashierIdentity> {
  const d = { ...defaults, ...deps };
  const badge = await d.resolve(raw);
  if (!badge.ok) return { ok: false, reason: badge.reason };
  const member = await d.member(badge.personId, organizationId);
  if (!member) return { ok: false, reason: "unknown" };
  return { ok: true, personId: badge.personId, email: member.email.toLowerCase(), name: member.name };
}
