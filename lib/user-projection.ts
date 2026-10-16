import { normalizePermissions } from "@/lib/access-control";
import { centralAuthHeaders, centralConnection } from "@/lib/central-config";
import { organizationProblem, resolveCentralOrganization } from "@/lib/central-organization";
import { linkableEntitlementId } from "@/lib/central-user-sync";
import { errorForNetwork, errorForResponse } from "@/lib/central-errors";
import { endsSessions } from "@/lib/session-policy";
import { recordEmailChange } from "@/lib/staff-identity";
import { prisma } from "@/lib/prisma";

interface CentralEmployeeProfile {
  person_id: string;
  full_name: string;
  email: string;
  status: string;
}

// What Central says a person may do in Exima, checked and in the form Exima keeps it.
export interface Entitlement {
  id: string;
  organization_id: string;
  role: string;
  permissions: string[];
  version: number;
}

// Central role keys look like CASHIER_LEAD. Exima keeps them lowercase.
const CENTRAL_ROLE_KEY = /^[A-Z][A-Z0-9_]*$/;

export function parseEntitlement(entitlement: unknown): Entitlement {
  if (!entitlement || typeof entitlement !== "object" || Array.isArray(entitlement)) {
    throw new Error("Exima entitlement is missing");
  }

  const value = entitlement as Record<string, unknown>;
  const appId = process.env.HUB_SSO_APP_ID?.trim() || "exima";
  if (
    typeof value.id !== "string" || !value.id ||
    (value.application_id !== undefined && value.application_id !== appId) ||
    typeof value.organization_id !== "string" || !value.organization_id ||
    typeof value.role !== "string" || !CENTRAL_ROLE_KEY.test(value.role) ||
    !Array.isArray(value.permissions) || !value.permissions.every((permission) => typeof permission === "string") ||
    typeof value.version !== "number" || !Number.isInteger(value.version) || value.version < 1
  ) {
    throw new Error("Exima entitlement is invalid");
  }

  const permissions = normalizePermissions(value.permissions as string[]);
  if (permissions.length !== value.permissions.length) {
    throw new Error("Exima entitlement contains unsupported permissions");
  }

  return {
    id: value.id,
    organization_id: value.organization_id,
    role: value.role.toLowerCase(),
    permissions,
    version: value.version,
  };
}

async function fetchProfile(path: string, personId: string) {
  const connection = centralConnection();
  if (!connection) throw new Error("CENTRAL_API_BASE_URL and CENTRAL_API_TOKEN are not configured");
  const url = new URL(`${connection.base}${path}`);
  url.searchParams.set("person_id", personId);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...centralAuthHeaders(connection.token),
        accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw errorForNetwork(error);
  }
  const body = (await response.json().catch(() => null)) as { data?: CentralEmployeeProfile } | null;
  if (response.status >= 500) throw errorForResponse(response.status);
  return { response, profile: body?.data ?? null };
}

// The employee profile, or the intern's when the person is an intern. Both carry the same fields Exima reads.
export async function lookupCentralEmployee(personId: string) {
  const employee = await fetchProfile("/employees/lookup", personId);
  if (employee.response.ok && employee.profile) return employee.profile;
  if (employee.response.status === 404) {
    const intern = await fetchProfile("/interns/lookup", personId);
    if (intern.response.ok && intern.profile) return intern.profile;
  }
  throw new Error("Central employee lookup failed");
}

// Makes the local account match what Central says: made on the first visit, brought up to date when the role,
// permissions or email changed. `person` is who the Hub says it is; Central must agree.
export async function projectEmployee(person: { id: string; email: string }, entitlement: Entitlement) {
  const employee = await lookupCentralEmployee(person.id);
  if (employee.person_id !== person.id || employee.status.toUpperCase() !== "ACTIVE") {
    throw new Error("Central employee is not active");
  }

  const normalizedEmail = employee.email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail !== person.email.trim().toLowerCase()) {
    throw new Error("Central identity does not match the Hub session");
  }

  const project = () => prisma.$transaction(async (transaction) => {
    const organization = await resolveCentralOrganization(transaction, entitlement.organization_id);
    if (!organization) throw new Error(organizationProblem(entitlement.organization_id));

    const linkedByPerson = await transaction.user.findUnique({ where: { centralPersonId: person.id } });
    // The person decides who this is. An access that comes from a group has one id for
    // everybody in it, so the entitlement id is only kept when it belongs to one person.
    const entitlementLink = linkableEntitlementId(entitlement.id);

    // First sign-in: the account is made from Central. Role and permissions are filled in below.
    const existingUser = linkedByPerson || await transaction.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    }) || await transaction.user.create({
      data: {
        organizationId: organization.id,
        email: normalizedEmail,
        name: employee.full_name,
        centralPersonId: person.id,
        centralEntitlementId: entitlementLink,
      },
    });
    if (existingUser.organizationId !== organization.id) {
      throw new Error("Exima account belongs to another organization");
    }
    if (existingUser.centralPersonId && existingUser.centralPersonId !== person.id) {
      throw new Error("Exima account is linked to another Central identity");
    }

    // Central may have given this person a new email. The old one is remembered for badges;
    // when the new one belongs to someone else the account keeps its own.
    let emailToStore = normalizedEmail;
    if (existingUser.email.toLowerCase() !== normalizedEmail) {
      const holder = await transaction.user.findFirst({
        where: { email: { equals: normalizedEmail, mode: "insensitive" }, id: { not: existingUser.id } },
        select: { id: true },
      });
      if (holder) {
        console.warn("[auth] New Central email already belongs to another Exima account, keeping the old one");
        emailToStore = existingUser.email;
      } else {
        await recordEmailChange(transaction, existingUser.id, existingUser.email);
      }
    }

    const endsOtherSessions = endsSessions(existingUser.permissions, entitlement.permissions);

    const claimed = await transaction.user.updateMany({
      where: {
        id: existingUser.id,
        OR: [{ centralPersonId: null }, { centralPersonId: person.id }],
      },
      data: {
        centralPersonId: person.id,
        centralEntitlementId: entitlementLink,
        email: emailToStore,
        name: employee.full_name,
        centralStatus: "active",
        role: entitlement.role,
        permissions: entitlement.permissions,
        entitlementVersion: entitlement.version,
        entitlementSyncedAt: new Date(),
        ...(endsOtherSessions ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    if (claimed.count !== 1) throw new Error("Exima identity projection changed concurrently");
    return transaction.user.findUniqueOrThrow({ where: { id: existingUser.id } });
  });


  try {
    return await project();
  } catch (error) {
    // Two first visits at once: the other one made the account, so look again.
    if ((error as { code?: string } | null)?.code === "P2002") return project();
    throw error;
  }
}
