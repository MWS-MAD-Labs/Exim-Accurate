import { normalizePermissions } from "@/lib/access-control";
import { lookupEntitlement } from "@/lib/central-access";
import { resolveCentralOrganization } from "@/lib/central-organization";
import { linkableEntitlementId } from "@/lib/central-user-sync";
import { prisma } from "@/lib/prisma";
import { resolveBadge, type BadgeResult } from "@/lib/staff-identity";

// A badge of someone who joined after the last sync: ask Central about that one person instead
// of waiting for the next automatic sync. One question per value per minute, so scanning
// strangers' cards cannot turn into load on Central.
const ASKED_MS = 60_000;
const asked = new Map<string, number>();

export function clearProvisionMemoryForTest() {
  asked.clear();
}

type CentralEmployee = { person_id: string; full_name: string; email: string; status: string };

async function lookupEmployee(by: { personId: string } | { email: string }): Promise<CentralEmployee | null> {
  const base = process.env.CENTRAL_DATA_API_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.CENTRAL_DATA_API_TOKEN?.trim();
  if (!base || !token) return null;
  try {
    const url = new URL(`${base}/api/internal/employees/lookup`);
    if ("personId" in by) url.searchParams.set("person_id", by.personId);
    else url.searchParams.set("email", by.email);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { data?: CentralEmployee } | null;
    return body?.data ?? null;
  } catch {
    return null;
  }
}

export async function provisionFromCentral(raw: string, now = Date.now()): Promise<boolean> {
  const value = raw.trim().toLowerCase();
  // Only a card with an email can name a person. A signed badge already holds the id.
  const by = value.includes("@") ? { email: value } : null;
  if (!by) return false;

  const last = asked.get(value);
  if (last && now - last < ASKED_MS) return false;
  asked.set(value, now);

  const employee = await lookupEmployee(by);
  if (!employee || employee.status.toUpperCase() !== "ACTIVE") return false;
  const entitlement = await lookupEntitlement(employee.person_id).catch(() => null);
  if (!entitlement?.is_active) return false;
  const permissions = normalizePermissions(entitlement.permissions);
  if (permissions.length === 0) return false;

  const organization = await resolveCentralOrganization(prisma, entitlement.organization_id);
  if (!organization) return false;

  const email = employee.email.trim().toLowerCase();
  const taken = await prisma.user.findFirst({
    where: { OR: [{ centralPersonId: employee.person_id }, { email: { equals: email, mode: "insensitive" } }] },
    select: { id: true },
  });
  if (taken) return false;

  await prisma.user.create({
    data: {
      organizationId: organization.id,
      centralPersonId: employee.person_id,
      centralEntitlementId: linkableEntitlementId(entitlement.id),
      centralStatus: "active",
      email,
      name: employee.full_name,
      role: entitlement.role.toLowerCase(),
      permissions,
      entitlementVersion: entitlement.version,
      entitlementSyncedAt: new Date(),
    },
  });
  return true;
}

// resolveBadge, and when the badge is unknown a single question to Central before giving up.
export async function resolveBadgeWithCentral(raw: string): Promise<BadgeResult> {
  const first = await resolveBadge(raw);
  if (first.ok || first.reason !== "unknown") return first;
  return (await provisionFromCentral(raw)) ? resolveBadge(raw) : first;
}
