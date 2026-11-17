import { Prisma } from "@prisma/client";
import { centralAuthHeaders, centralConnection } from "@/lib/central-config";
import { prisma } from "@/lib/prisma";
import { syncUsersFromCentral } from "@/lib/central-user-sync";
import { normalizeEmail } from "@/lib/staff-identity";

export type CentralPerson = { person_id: string; full_name: string; email: string; status: string };

// Tables that keep a staff member by email and person id. Same list as scripts/staff-audit.ts.
const STAFF_TABLES = [
  "PosSale",
  "PosReservation",
  "CheckoutSession",
  "PosStaffDayOff",
  "PosStaffAllowanceAdjustment",
  "PosStaffAllowanceDebtSettlement",
  "PosAllowanceNotification",
] as const;

export type LinkError =
  | "NOT_FOUND"
  | "ALREADY_LINKED"
  | "CENTRAL_UNAVAILABLE"
  | "PERSON_NOT_FOUND"
  | "PERSON_INACTIVE"
  | "OTHER_ORGANIZATION"
  | "PERSON_HAS_ACCOUNT"
  | "RECORDS_OVERLAP";

export const LINK_MESSAGES: Record<LinkError, string> = {
  NOT_FOUND: "User not found.",
  ALREADY_LINKED: "This account already has a Central identity.",
  CENTRAL_UNAVAILABLE: "Central could not be reached. Try again in a moment.",
  PERSON_NOT_FOUND: "Central has no employee or intern with this email.",
  PERSON_INACTIVE: "This person is not active in Central.",
  OTHER_ORGANIZATION: "This account belongs to another organization.",
  PERSON_HAS_ACCOUNT: "Central already has another Sade account for this person with its own activity. It needs a manual merge.",
  RECORDS_OVERLAP: "Records of both emails overlap (same day or period). It needs a manual merge.",
};

export type LinkResult = { ok: true; personId: string; name: string; email: string } | { ok: false; error: LinkError };

// The employee or intern Central has for this email.
export async function findCentralPersonByEmail(email: string): Promise<CentralPerson | "unavailable" | null> {
  const connection = centralConnection();
  if (!connection) return "unavailable";
  const ask = async (path: string) => {
    const url = new URL(`${connection.base}${path}`);
    url.searchParams.set("email", email);
    const response = await fetch(url, {
      headers: { ...centralAuthHeaders(connection.token), accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { data?: CentralPerson } | null;
    return { response, person: body?.data ?? null };
  };
  try {
    const employee = await ask("/employees/lookup");
    if (employee.response.ok && employee.person) return employee.person;
    if (employee.response.status !== 404) return "unavailable";
    const intern = await ask("/interns/lookup");
    if (intern.response.ok && intern.person) return intern.person;
    return intern.response.status === 404 ? null : "unavailable";
  } catch {
    return "unavailable";
  }
}

// Ties an older local account to a person in Central. The person id goes on the account and on every
// POS row written under its email first; the email itself is changed afterwards by the sync, which
// remembers the old one. That way allowance, sales and days off stay with the person.
export async function linkUserToCentral(input: { userId: string; organizationId: string; centralEmail: string }): Promise<LinkResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, email: true, organizationId: true, centralPersonId: true },
  });
  if (!user) return { ok: false, error: "NOT_FOUND" };
  if (user.organizationId !== input.organizationId) return { ok: false, error: "OTHER_ORGANIZATION" };
  if (user.centralPersonId) return { ok: false, error: "ALREADY_LINKED" };

  const found = await findCentralPersonByEmail(normalizeEmail(input.centralEmail));
  if (found === "unavailable") return { ok: false, error: "CENTRAL_UNAVAILABLE" };
  if (!found) return { ok: false, error: "PERSON_NOT_FOUND" };
  if (found.status.toUpperCase() !== "ACTIVE") return { ok: false, error: "PERSON_INACTIVE" };

  const personId = found.person_id;
  const oldEmail = normalizeEmail(user.email);

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // The sync may already have made an account for this person from their Central email.
      // An empty one is only a shell and is removed; one with activity is left for a manual merge.
      const holder = await tx.user.findUnique({
        where: { centralPersonId: personId },
        select: {
          id: true,
          _count: {
            select: {
              accurateCredentials: true, exportJobs: true, importJobs: true, borrowingSessions: true, borrowingActivities: true,
              posSales: true, posReservations: true, posSettings: true, posAllocations: true, posAllowanceAdjustmentsCreated: true,
              posAllowanceDebtSettlementsCreated: true, posStockChanges: true, posSalesVoided: true, posSalePaymentRevisions: true,
            },
          },
        },
      });
      if (holder && holder.id !== user.id) {
        const used = Object.values(holder._count).some((count) => count > 0);
        let staffRows = 0n;
        for (const table of STAFF_TABLES) {
          const [row] = await tx.$queryRawUnsafe<{ rows: bigint }[]>(`SELECT count(*) AS rows FROM "${table}" WHERE "staffPersonId" = $1`, personId);
          staffRows += row.rows;
        }
        if (used || staffRows > 0n) return "PERSON_HAS_ACCOUNT" as const;
        await tx.user.delete({ where: { id: holder.id } });
      }

      await tx.user.update({
        where: { id: user.id },
        data: { centralPersonId: personId, name: found.full_name, centralStatus: "no_access", entitlementVersion: 0 },
      });
      for (const table of STAFF_TABLES) {
        await tx.$executeRawUnsafe(
          `UPDATE "${table}" SET "staffPersonId" = $1 WHERE "staffPersonId" IS NULL AND lower("staffEmail") = $2`,
          personId,
          oldEmail,
        );
      }
      return "ok" as const;
    });
    if (outcome !== "ok") return { ok: false, error: outcome };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "RECORDS_OVERLAP" };
    }
    throw error;
  }

  // Brings in the Central email, role and permissions, and remembers the old email.
  await syncUsersFromCentral().catch((error) => {
    console.error("[users] sync after link failed", error instanceof Error ? error.message : error);
  });
  return { ok: true, personId, name: found.full_name, email: normalizeEmail(found.email) };
}
