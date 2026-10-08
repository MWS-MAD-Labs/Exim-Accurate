import type { Prisma } from "@prisma/client";
import { looksLikeBadgeToken, verifyBadgeToken } from "@/lib/badge-token";
import { prisma } from "@/lib/prisma";

type Db = typeof prisma | Prisma.TransactionClient;

// Staff are kept by the Central person id. The email is only a label that can change.
export type StaffRef = { personId: string | null; email: string };

export function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

// Rows of one staff member. A row written before the id existed is matched by its email.
export function staffWhere(ref: StaffRef) {
  return ref.personId
    ? { OR: [{ staffPersonId: ref.personId }, { staffPersonId: null, staffEmail: ref.email }] }
    : { staffEmail: ref.email };
}

// What to store on a new row.
export function staffData(ref: StaffRef) {
  return { staffPersonId: ref.personId, staffEmail: ref.email };
}

export type StaffUser = {
  id: string;
  name: string | null;
  email: string;
  centralPersonId: string | null;
  badgeVersion: number;
  permissions: readonly string[];
  centralStatus: string | null;
};

// A badge works for someone who still has access to Exima. Whoever lost it in Central is turned away.
export function hasActiveAccess(user: Pick<StaffUser, "permissions" | "centralStatus">) {
  return user.permissions.length > 0 && user.centralStatus === "active";
}
export type StaffLookup = {
  byEmail(email: string): Promise<StaffUser | null>;
  byPersonId(personId: string): Promise<StaffUser | null>;
  byPreviousEmail(email: string): Promise<{ user: StaffUser; replacedAt: Date } | null>;
};

export function prismaStaffLookup(db: Db = prisma): StaffLookup {
  const select = { id: true, name: true, email: true, centralPersonId: true, badgeVersion: true, permissions: true, centralStatus: true } as const;
  return {
    byEmail: (email) => db.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select }),
    byPersonId: (personId) => db.user.findUnique({ where: { centralPersonId: personId }, select }),
    async byPreviousEmail(email) {
      const row = await db.userEmailHistory.findFirst({
        where: { email },
        orderBy: { replacedAt: "desc" },
        select: { replacedAt: true, user: { select } },
      });
      return row ? { user: row.user, replacedAt: row.replacedAt } : null;
    },
  };
}

// The staff member behind an email. An email nobody knows stays a plain email (a guest).
export async function resolveStaff(rawEmail: string, db: Db = prisma): Promise<StaffRef> {
  const email = normalizeEmail(rawEmail);
  const lookup = prismaStaffLookup(db);
  // An email the person had before still points at them for records written earlier,
  // like a reservation made before Central changed the email.
  const user = (await lookup.byEmail(email)) ?? (await lookup.byPreviousEmail(email))?.user ?? null;
  if (user?.centralPersonId) return { personId: user.centralPersonId, email: user.email.toLowerCase() };
  return { personId: null, email };
}

export type BadgeResult =
  | { ok: true; personId: string; email: string; name: string | null; via: "token" | "email" }
  | { ok: false; reason: "unknown" | "revoked" | "inactive" };

// Cards printed before the signed badge hold the email. Accepted until this is switched off.
export function legacyEmailBadgesAllowed() {
  return (process.env.EXIMA_LEGACY_EMAIL_BADGES ?? "on").trim().toLowerCase() !== "off";
}

// What a scanned badge means: a signed badge made by this server, or, while allowed, the email
// the person has now. Everything else is refused, so typing somebody's name gets nothing.
export async function resolveBadge(raw: string, lookup: StaffLookup = prismaStaffLookup()): Promise<BadgeResult> {
  const value = raw.trim();
  const toResult = (user: StaffUser, via: "token" | "email"): BadgeResult =>
    !user.centralPersonId
      ? { ok: false, reason: "unknown" }
      : !hasActiveAccess(user)
        ? { ok: false, reason: "inactive" }
        : { ok: true, personId: user.centralPersonId, email: user.email.toLowerCase(), name: user.name, via };

  if (looksLikeBadgeToken(value)) {
    const verified = verifyBadgeToken(value);
    if (!verified) return { ok: false, reason: "unknown" };
    const user = await lookup.byPersonId(verified.personId);
    if (!user) return { ok: false, reason: "unknown" };
    return user.badgeVersion === verified.version ? toResult(user, "token") : { ok: false, reason: "revoked" };
  }

  const email = normalizeEmail(value);
  if (!legacyEmailBadgesAllowed() || !email.includes("@")) return { ok: false, reason: "unknown" };
  const current = await lookup.byEmail(email);
  return current ? toResult(current, "email") : { ok: false, reason: "unknown" };
}

// Called when Central gave a person a new email: the old one is remembered for badges.
export async function recordEmailChange(db: Db, userId: string, oldEmail: string) {
  const email = normalizeEmail(oldEmail);
  await db.userEmailHistory.upsert({
    where: { userId_email: { userId, email } },
    create: { userId, email },
    update: { replacedAt: new Date() },
  });
}
