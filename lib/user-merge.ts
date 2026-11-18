import { Prisma } from "@prisma/client";
import { findCentralPersonByEmail } from "@/lib/central-link";
import { prisma } from "@/lib/prisma";
import { claimLegacyRows, normalizeEmail, previewLegacyRows, recordEmailChange } from "@/lib/staff-identity";

type Db = typeof prisma | Prisma.TransactionClient;

// Every column that points at a user, except the email history (handled on its own). A test compares this list with
// the schema, so a table added later cannot be forgotten.
export const MERGE_REFERENCES = [
  ["AccurateCredentials", "userId"],
  ["ExportJob", "userId"],
  ["ImportJob", "userId"],
  ["BorrowingSession", "userId"],
  ["BorrowingActivity", "userId"],
  ["PosSettings", "userId"],
  ["PosReservation", "userId"],
  ["PosSale", "userId"],
  ["PosSale", "voidedById"],
  ["PosSalePaymentRevision", "changedById"],
  ["PosStockChange", "userId"],
  ["PosStockAllocation", "userId"],
  ["PosStaffAllowanceAdjustment", "createdById"],
  ["PosStaffAllowanceDebtSettlement", "createdById"],
] as const;

// Tables where a user and an idempotency key are unique together: a key both accounts used would clash.
const IDEMPOTENT_TABLES = ["PosReservation", "PosSale"] as const;

export type MergeBlocker =
  | "NOT_FOUND"
  | "SAME_ACCOUNT"
  | "OTHER_ORGANIZATION"
  | "OLD_IS_LINKED"
  | "TARGET_NOT_LINKED"
  | "STAFF_ROWS_CLASH"
  | "KEYS_CLASH";

export const MERGE_MESSAGES: Record<MergeBlocker | "CENTRAL_UNAVAILABLE" | "PERSON_NOT_FOUND" | "PERSON_INACTIVE" | "NO_ACCOUNT", string> = {
  NOT_FOUND: "User not found.",
  SAME_ACCOUNT: "That is the same account.",
  OTHER_ORGANIZATION: "The accounts belong to different organizations.",
  OLD_IS_LINKED: "This account already has a Central identity. Only an account without one can be merged.",
  TARGET_NOT_LINKED: "The other account has no Central identity.",
  STAFF_ROWS_CLASH: "Some records of both accounts are for the same day or period. They need a manual merge.",
  KEYS_CLASH: "Both accounts used the same request key on some sales or reservations. They need a manual merge.",
  CENTRAL_UNAVAILABLE: "Central could not be reached. Try again in a moment.",
  PERSON_NOT_FOUND: "Central has no employee or intern with this email.",
  PERSON_INACTIVE: "This person is not active in Central.",
  NO_ACCOUNT: "Exima has no account for this person yet. Use Link to Central instead.",
};

export type MergePlan = {
  from: { id: string; email: string; name: string | null };
  into: { id: string; email: string; name: string | null; centralPersonId: string };
  // What moves to the account that stays: rows per table and column, and the POS staff rows tied by email.
  moves: { table: string; column: string; rows: number }[];
  staffRows: { claimable: number; clash: number };
  keyClashes: number;
  blockers: MergeBlocker[];
};

async function emailsOf(db: Db, userId: string, current: string): Promise<string[]> {
  const history = await db.userEmailHistory.findMany({ where: { userId }, select: { email: true } });
  return [current, ...history.map((row) => row.email)].map(normalizeEmail);
}

// What merging `fromId` into `intoId` would do. `intoId` is the account tied to Central: the one that stays.
export async function planUserMerge(db: Db, input: { fromId: string; intoId: string; organizationId: string }): Promise<MergePlan | { blockers: MergeBlocker[] }> {
  if (input.fromId === input.intoId) return { blockers: ["SAME_ACCOUNT"] };
  const select = { id: true, email: true, name: true, organizationId: true, centralPersonId: true } as const;
  const [from, into] = await Promise.all([db.user.findUnique({ where: { id: input.fromId }, select }), db.user.findUnique({ where: { id: input.intoId }, select })]);
  if (!from || !into) return { blockers: ["NOT_FOUND"] };
  if (from.organizationId !== input.organizationId || into.organizationId !== input.organizationId) {
    return { blockers: ["OTHER_ORGANIZATION"] };
  }
  const blockers: MergeBlocker[] = [];
  if (from.centralPersonId) blockers.push("OLD_IS_LINKED");
  if (!into.centralPersonId) blockers.push("TARGET_NOT_LINKED");

  const moves: MergePlan["moves"] = [];
  for (const [table, column] of MERGE_REFERENCES) {
    const [row] = await db.$queryRawUnsafe<{ rows: bigint }[]>(`SELECT count(*) AS rows FROM "${table}" WHERE "${column}" = $1`, from.id);
    moves.push({ table, column, rows: Number(row?.rows ?? 0) });
  }

  let keyClashes = 0;
  for (const table of IDEMPOTENT_TABLES) {
    const [row] = await db.$queryRawUnsafe<{ rows: bigint }[]>(
      `SELECT count(*) AS rows FROM "${table}" a WHERE a."userId" = $1 AND EXISTS (SELECT 1 FROM "${table}" b WHERE b."userId" = $2 AND b."idempotencyKey" = a."idempotencyKey")`,
      from.id,
      into.id,
    );
    keyClashes += Number(row?.rows ?? 0);
  }

  const staffRows = into.centralPersonId
    ? await previewLegacyRows(db, into.centralPersonId, await emailsOf(db, from.id, from.email))
    : { claimable: 0, clash: 0 };
  if (staffRows.clash > 0) blockers.push("STAFF_ROWS_CLASH");
  if (keyClashes > 0) blockers.push("KEYS_CLASH");

  return {
    from: { id: from.id, email: from.email, name: from.name },
    into: { id: into.id, email: into.email, name: into.name, centralPersonId: into.centralPersonId ?? "" },
    moves,
    staffRows,
    keyClashes,
    blockers,
  };
}

class MergeAborted extends Error {
  constructor(readonly blocker: MergeBlocker) {
    super(blocker);
  }
}

// Moves everything of `fromId` to `intoId` and removes `fromId`, all or nothing. The old email stays with the account
// that remains, so an older badge or reservation under it still finds the person.
export async function mergeUsers(input: { fromId: string; intoId: string; organizationId: string }): Promise<{ ok: true; plan: MergePlan } | { ok: false; blockers: MergeBlocker[] }> {
  try {
    return await prisma.$transaction(async (tx) => {
      const plan = await planUserMerge(tx, input);
      if (!("from" in plan) || plan.blockers.length > 0) return { ok: false as const, blockers: plan.blockers };

      for (const [table, column] of MERGE_REFERENCES) {
        await tx.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = $1 WHERE "${column}" = $2`, plan.into.id, plan.from.id);
      }
      const emails = await emailsOf(tx, plan.from.id, plan.from.email);
      const claim = await claimLegacyRows(tx, plan.into.centralPersonId, emails);
      if (claim.left > 0) throw new MergeAborted("STAFF_ROWS_CLASH");

      for (const email of emails) await recordEmailChange(tx, plan.into.id, email);
      await tx.userEmailHistory.deleteMany({ where: { userId: plan.from.id } });
      await tx.user.delete({ where: { id: plan.from.id } });
      return { ok: true as const, plan };
    });
  } catch (error) {
    if (error instanceof MergeAborted) return { ok: false, blockers: [error.blocker] };
    throw error;
  }
}

export type MergeRequestResult =
  | { ok: true; applied: boolean; plan: MergePlan }
  | { ok: false; error: keyof typeof MERGE_MESSAGES; blockers?: MergeBlocker[] };

// The admin names the Central email of the person. The account that stays is the one Exima already has for that
// person; the account the admin opened (without a Central identity) is moved into it. With apply false it only looks.
export async function mergeIntoCentralPerson(input: { userId: string; organizationId: string; centralEmail: string; apply: boolean }): Promise<MergeRequestResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId }, select: { id: true, organizationId: true, centralPersonId: true } });
  if (!user) return { ok: false, error: "NOT_FOUND" };
  if (user.organizationId !== input.organizationId) return { ok: false, error: "OTHER_ORGANIZATION" };
  if (user.centralPersonId) return { ok: false, error: "OLD_IS_LINKED" };

  const found = await findCentralPersonByEmail(normalizeEmail(input.centralEmail));
  if (found === "unavailable") return { ok: false, error: "CENTRAL_UNAVAILABLE" };
  if (!found) return { ok: false, error: "PERSON_NOT_FOUND" };
  if (found.status.toUpperCase() !== "ACTIVE") return { ok: false, error: "PERSON_INACTIVE" };

  const target = await prisma.user.findUnique({ where: { centralPersonId: found.person_id }, select: { id: true } });
  if (!target) return { ok: false, error: "NO_ACCOUNT" };

  if (!input.apply) {
    const plan = await planUserMerge(prisma, { fromId: user.id, intoId: target.id, organizationId: input.organizationId });
    if (!("from" in plan)) return { ok: false, error: plan.blockers[0] ?? "NOT_FOUND", blockers: plan.blockers };
    return { ok: true, applied: false, plan };
  }
  const merged = await mergeUsers({ fromId: user.id, intoId: target.id, organizationId: input.organizationId });
  if (!merged.ok) return { ok: false, error: merged.blockers[0] ?? "NOT_FOUND", blockers: merged.blockers };
  return { ok: true, applied: true, plan: merged.plan };
}
