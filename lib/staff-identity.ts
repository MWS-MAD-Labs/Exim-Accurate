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

// The tables that keep a staff member by email and person id. Same list as scripts/staff-audit.ts.
export const STAFF_TABLES = [
  "PosSale",
  "PosReservation",
  "CheckoutSession",
  "PosStaffDayOff",
  "PosStaffAllowanceAdjustment",
  "PosStaffAllowanceDebtSettlement",
  "PosAllowanceNotification",
] as const;

// What makes a row unique for a person, besides the person. A row written under an email is only given the id when
// that slot is free for the person, or it would break the unique index; the row stays as it was.
const UNIQUE_SLOT: Partial<Record<(typeof STAFF_TABLES)[number], readonly string[]>> = {
  PosAllowanceNotification: ["credentialId", "periodStartsAt", "periodEndsAt", "reminderDay"],
  PosStaffAllowanceAdjustment: ["credentialId", "periodStartsAt", "periodEndsAt"],
  PosStaffDayOff: ["credentialId", "date"],
};

// Rows written before the person id existed hold only an email. Once the person is known they are given the id, for the
// email the person has now and every email they had before, so allowance, sales and days off follow the person and not
// the email. `left` is what still has no id for these emails (a clash with a row the person already has).
export async function claimLegacyRows(
  db: Db,
  personId: string,
  emails: readonly string[],
): Promise<{ claimed: number; left: number }> {
  const list = [...new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean))];
  if (!personId || list.length === 0) return { claimed: 0, left: 0 };
  let claimed = 0;
  let left = 0;
  for (const table of STAFF_TABLES) {
    const slot = UNIQUE_SLOT[table] ?? [];
    const same = (a: string, b: string) => slot.map((column) => `${a}."${column}" = ${b}."${column}"`).join(" AND ");
    const guard = slot.length
      ? ` AND NOT EXISTS (SELECT 1 FROM "${table}" o WHERE o."staffPersonId" = $1 AND ${same("o", "t")})` +
        ` AND NOT EXISTS (SELECT 1 FROM "${table}" n WHERE n."staffPersonId" IS NULL AND lower(n."staffEmail") = ANY($2::text[]) AND ${same("n", "t")} AND n."id" < t."id")`
      : "";
    claimed += await db.$executeRawUnsafe(
      `UPDATE "${table}" t SET "staffPersonId" = $1 WHERE t."staffPersonId" IS NULL AND lower(t."staffEmail") = ANY($2::text[])${guard}`,
      personId,
      list,
    );
    const [row] = await db.$queryRawUnsafe<{ rows: bigint }[]>(
      `SELECT count(*) AS rows FROM "${table}" WHERE "staffPersonId" IS NULL AND lower("staffEmail") = ANY($1::text[])`,
      list,
    );
    left += Number(row?.rows ?? 0);
  }
  return { claimed, left };
}

// Everyone tied to a person who has an email history (their email changed at some point) takes the older rows of every
// email along. Finds nothing once it is done, so it can run at each sync. `skip` is who was already handled.
export async function claimForUsersWithHistory(
  db: Db,
  skip: ReadonlySet<string> = new Set(),
): Promise<{ claimed: number; left: number }> {
  const users = await db.user.findMany({
    where: { centralPersonId: { not: null }, emailHistory: { some: {} }, id: { notIn: [...skip] } },
    select: { id: true, email: true, centralPersonId: true },
  });
  let claimed = 0;
  let left = 0;
  for (const user of users) {
    const result = await claimLegacyRows(db, user.centralPersonId as string, await emailsOfUser(db, user.id, user.email));
    claimed += result.claimed;
    left += result.left;
  }
  return { claimed, left };
}

// How many older rows `claimLegacyRows` would look at for these emails (a clash can still leave some). Changes nothing.
export async function countLegacyRows(db: Db, emails: readonly string[]): Promise<number> {
  const list = [...new Set(emails.map((email) => normalizeEmail(email)).filter(Boolean))];
  if (list.length === 0) return 0;
  let rows = 0;
  for (const table of STAFF_TABLES) {
    const [row] = await db.$queryRawUnsafe<{ rows: bigint }[]>(
      `SELECT count(*) AS rows FROM "${table}" WHERE "staffPersonId" IS NULL AND lower("staffEmail") = ANY($1::text[])`,
      list,
    );
    rows += Number(row?.rows ?? 0);
  }
  return rows;
}

// The email a user has now and every one they had before.
export async function emailsOfUser(db: Db, userId: string, current: string): Promise<string[]> {
  const history = await db.userEmailHistory.findMany({ where: { userId }, select: { email: true } });
  return [current, ...history.map((row) => row.email)];
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
