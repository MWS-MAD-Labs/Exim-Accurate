import { normalizePermissions } from "@/lib/access-control";
import { resolveCentralOrganization } from "@/lib/central-organization";
import { prisma } from "@/lib/prisma";
import { createFailureTracker } from "@/lib/sync-failures";
import { endsSessions } from "@/lib/session-policy";
import { recordEmailChange } from "@/lib/staff-identity";
import { fetchCentralKeyResult, isChanged, rememberCentralKey } from "@/lib/central-sync-status";

export type CentralAccessRow = {
  id: string;
  person_id: string;
  organization_id: string;
  role: string;
  permissions: string[];
  version: number;
  person: { full_name: string; email: string };
};

export type LocalUser = {
  id: string;
  organizationId: string;
  centralPersonId: string | null;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
  entitlementVersion: number;
  centralStatus?: string | null;
};

export type CentralStatus = "active" | "no_access" | "unknown";

type Projection = {
  centralStatus: "active";
  centralPersonId: string;
  centralEntitlementId: string | null;
  email: string;
  name: string;
  role: string;
  permissions: string[];
  entitlementVersion: number;
};

export type SyncPlan = {
  create: (Projection & { organizationId: string })[];
  update: { id: string; data: Projection; endSessions: boolean }[];
  revoke: { id: string; centralPersonId: string; endSessions: boolean }[];
  unchanged: number;
  unmapped: string[];
  // Central gave the person another email. The old one is remembered for badges.
  emailChanges: { userId: string; from: string; to: string }[];
  // The new email already belongs to someone else, so the account keeps its old one.
  needsReview: string[];
};

// An access that comes from a group has one id for everybody in it. Only an id that
// belongs to one person can be kept on that person.
export function linkableEntitlementId(id: string) {
  return id.startsWith("group:") ? null : id;
}

function project(row: CentralAccessRow): Projection {
  return {
    centralStatus: "active",
    centralPersonId: row.person_id,
    centralEntitlementId: linkableEntitlementId(row.id),
    email: row.person.email.trim().toLowerCase(),
    name: row.person.full_name,
    role: row.role.toLowerCase(),
    permissions: normalizePermissions(row.permissions),
    entitlementVersion: row.version,
  };
}

const sameSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value) => right.includes(value));

// Compares what Central lists with the accounts Exima has. Pure, so it can be tested.
export function planSync(
  rows: CentralAccessRow[],
  users: LocalUser[],
  organizations: Map<string, string>,
): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], revoke: [], unchanged: 0, unmapped: [], emailChanges: [], needsReview: [] };
  const byPerson = new Map(users.filter((user) => user.centralPersonId).map((user) => [user.centralPersonId, user]));
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const seen = new Set<string>();

  for (const row of rows) {
    const organizationId = organizations.get(row.organization_id);
    if (!organizationId) {
      plan.unmapped.push(row.person.email);
      continue;
    }
    let next = project(row);
    const current = byPerson.get(row.person_id) ?? byEmail.get(next.email);
    if (!current) {
      plan.create.push({ ...next, organizationId });
      continue;
    }
    seen.add(current.id);
    if (current.email.toLowerCase() !== next.email) {
      const holder = byEmail.get(next.email);
      if (holder && holder.id !== current.id) {
        plan.needsReview.push(next.email);
        next = { ...next, email: current.email };
      } else if (current.centralPersonId) {
        plan.emailChanges.push({ userId: current.id, from: current.email.toLowerCase(), to: next.email });
      }
    }
    const same =
      current.centralPersonId === next.centralPersonId &&
      current.email.toLowerCase() === next.email &&
      current.name === next.name &&
      current.role === next.role &&
      current.entitlementVersion === next.entitlementVersion &&
      current.centralStatus === "active" &&
      sameSet(current.permissions, next.permissions);
    if (same) plan.unchanged += 1;
    else plan.update.push({ id: current.id, data: next, endSessions: endsSessions(current.permissions, next.permissions) });
  }

  // Accounts Central no longer lists keep their history but cannot open anything.
  for (const user of users) {
    if (seen.has(user.id) || !user.centralPersonId) continue;
    // Newly lost access, or an account that was never classified.
    if (user.permissions.length > 0 || !user.centralStatus) plan.revoke.push({ id: user.id, centralPersonId: user.centralPersonId, endSessions: endsSessions(user.permissions, []) });
  }
  return plan;
}

export const SYNC_APPLICATION_ID = () => process.env.HUB_SSO_APP_ID?.trim() || "exima";

export async function fetchCentralAccess(): Promise<{ rows: CentralAccessRow[]; key: string }> {
  const base = process.env.CENTRAL_DATA_API_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.CENTRAL_DATA_API_TOKEN?.trim();
  if (!base || !token) throw new Error("Central API is not configured");
  const applicationId = SYNC_APPLICATION_ID();
  const rows: CentralAccessRow[] = [];
  let key = "";
  for (let page = 1; ; page += 1) {
    const url = new URL(`${base}/api/internal/application-entitlements`);
    url.searchParams.set("application_id", applicationId);
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", "100");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | { data?: CentralAccessRow[]; paging?: { total_page: number }; key?: string }
      | null;
    if (!response.ok || !body?.data || !body.paging || !body.key) throw new Error("Central access list failed");
    // A change between two pages gives a different key; the last one is the one to keep.
    key = body.key;
    rows.push(...body.data);
    if (page >= body.paging.total_page) break;
  }
  return { rows, key };
}

export type SyncSummary = {
  created: number;
  updated: number;
  revoked: number;
  unchanged: number;
  unmapped: number;
  emailsChanged: number;
  needsReview: number;
};

// Does Central know this person at all? Told apart from "no access" so the list can say which.
export async function lookupCentralPerson(personId: string): Promise<"exists" | "missing" | "error"> {
  const base = process.env.CENTRAL_DATA_API_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.CENTRAL_DATA_API_TOKEN?.trim();
  if (!base || !token) return "error";
  try {
    const url = new URL(`${base}/api/internal/employees/lookup`);
    url.searchParams.set("person_id", personId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (response.ok) return "exists";
    return response.status === 404 ? "missing" : "error";
  } catch {
    return "error";
  }
}

export async function syncUsersFromCentral(): Promise<SyncSummary> {
  const { rows, key } = await fetchCentralAccess();
  // The organization named in the .env is mapped here if it was not yet, before people are placed in it.
  for (const id of new Set(rows.map((row) => row.organization_id))) await resolveCentralOrganization(prisma, id);
  const [users, organizations] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        organizationId: true,
        centralPersonId: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        entitlementVersion: true,
        centralStatus: true,
      },
    }),
    prisma.organization.findMany({ where: { centralOrganizationId: { not: null } }, select: { id: true, centralOrganizationId: true } }),
  ]);
  const plan = planSync(
    rows,
    users,
    new Map(organizations.map((organization) => [organization.centralOrganizationId as string, organization.id])),
  );
  const now = new Date();

  for (const item of plan.create) {
    await prisma.user.create({ data: { ...item, entitlementSyncedAt: now } });
  }
  for (const item of plan.update) {
    await prisma.user.update({
      where: { id: item.id },
      data: { ...item.data, entitlementSyncedAt: now, ...(item.endSessions ? { sessionVersion: { increment: 1 } } : {}) },
    });
  }
  for (const change of plan.emailChanges) {
    await recordEmailChange(prisma, change.userId, change.from);
  }
  for (const entry of plan.revoke) {
    const known = await lookupCentralPerson(entry.centralPersonId);
    // A failed lookup leaves the status as it was; the next run asks again.
    const status: CentralStatus | undefined = known === "exists" ? "no_access" : known === "missing" ? "unknown" : undefined;
    await prisma.user.update({
      where: { id: entry.id },
      data: {
        permissions: [],
        ...(status ? { centralStatus: status } : {}),
        entitlementSyncedAt: now,
        ...(entry.endSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  }
  const summary: SyncSummary = {
    created: plan.create.length,
    updated: plan.update.length,
    revoked: plan.revoke.length,
    unchanged: plan.unchanged,
    unmapped: plan.unmapped.length,
    emailsChanged: plan.emailChanges.length,
    needsReview: plan.needsReview.length,
  };
  await prisma.centralSyncState.upsert({
    where: { application: SYNC_APPLICATION_ID() },
    create: { application: SYNC_APPLICATION_ID(), key, syncedAt: now, checkedAt: now, lastSummary: summary },
    update: { key, syncedAt: now, checkedAt: now, lastError: null, lastSummary: summary },
  });
  rememberCentralKey(key);
  return summary;
}

export type AutoSyncResult =
  | { status: "unchanged" | "locked" | "unavailable" }
  | { status: "synced"; summary: SyncSummary }
  | { status: "error"; message: string };

const SYNC_LOCK_ID = 7_300_117;

const failures = createFailureTracker(3);

// The time of this check is always kept. The error is changed only when given: undefined leaves it as it was.
async function saveRun(error?: string | null) {
  const application = SYNC_APPLICATION_ID();
  await prisma.centralSyncState.updateMany({
    where: { application },
    data: { checkedAt: new Date(), ...(error === undefined ? {} : { lastError: error }) },
  });
}

// What the scheduler calls every minute: ask Central for the short key and sync only when it
// differs from the one of the last sync. One instance works at a time.
export async function syncIfChanged(): Promise<AutoSyncResult> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${SYNC_LOCK_ID}) AS locked`;
      if (!locked) return { status: "locked" } as const;
      try {
        const application = SYNC_APPLICATION_ID();
        const result = await fetchCentralKeyResult(application, 0);
        if ("failure" in result) {
          // A short outage leaves no mark; one that lasts shows on the page with its reason.
          await saveRun(failures.fail(result.message)).catch(() => undefined);
          return { status: "unavailable" } as const;
        }
        failures.succeed();
        const centralKey = result.key;
        const state = await prisma.centralSyncState.findUnique({ where: { application } });
        if (!isChanged(state?.key ?? null, centralKey)) {
          await saveRun(null);
          return { status: "unchanged" } as const;
        }
        return { status: "synced", summary: await syncUsersFromCentral() } as const;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        await saveRun(message).catch(() => undefined);
        return { status: "error", message } as const;
      }
    },
    { timeout: 120_000, maxWait: 5_000 },
  );
}
