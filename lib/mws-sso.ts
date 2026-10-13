import { InMemoryReplayStore, verifyRelayToken } from "mws-central-auth/server";
import { normalizePermissions } from "@/lib/access-control";
import { centralConnection } from "@/lib/central-config";
import { eximaAccessMode, isBypassEmail } from "@/lib/central-access";
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

interface RelayEntitlement {
  id: string;
  application_id: string;
  organization_id: string;
  role: string;
  permissions: string[];
  version: number;
}

const replayStore = new InMemoryReplayStore();

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function hubBaseUrl() {
  return requiredEnvironment("HUB_BASE_URL").replace(/\/$/, "");
}

export function getHubLaunchUrl(state: string) {
  const appId = requiredEnvironment("HUB_SSO_APP_ID");
  const url = new URL(`/apps/${encodeURIComponent(appId)}/launch`, hubBaseUrl());
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeHubCode(code: string, state: string) {
  let response: Response;
  try {
    response = await fetch(`${hubBaseUrl()}/sso/exchange`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-internal-secret": requiredEnvironment("HUB_INTERNAL_SECRET"),
      },
      body: JSON.stringify({ code, state, appId: requiredEnvironment("HUB_SSO_APP_ID") }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
  } catch (error) {
    throw errorForNetwork(error);
  }
  const body = (await response.json().catch(() => null)) as { data?: { token?: string } } | null;
  if (response.status >= 500) throw errorForResponse(response.status);
  if (!response.ok || !body?.data?.token) throw new Error("Hub code exchange failed");
  return body.data.token;
}

// Tells the Hub this person signed out here, so it ends their sessions in the other apps. The Hub's own stays.
// Best effort: a Hub that does not answer must not keep the person from signing out.
export async function notifyHubAppLogout(email: string, centralPersonId: string): Promise<void> {
  try {
    await fetch(`${hubBaseUrl()}/sso/app-logout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-internal-secret": requiredEnvironment("HUB_INTERNAL_SECRET"),
      },
      body: JSON.stringify({ appId: requiredEnvironment("HUB_SSO_APP_ID"), email, central_id: centralPersonId }),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
  } catch (error) {
    console.warn("[sso] Hub app-logout failed", error instanceof Error ? error.message : error);
  }
}

// Central role keys look like CASHIER_LEAD. Exima keeps them lowercase.
const CENTRAL_ROLE_KEY = /^[A-Z][A-Z0-9_]*$/;

export function decodeRelayEntitlement(token: string): RelayEntitlement {
  const encodedPayload = token.split(".")[1];
  if (!encodedPayload) throw new Error("Hub relay payload is missing");

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
    entitlement?: unknown;
  };
  const entitlement = payload.entitlement;
  if (!entitlement || typeof entitlement !== "object" || Array.isArray(entitlement)) {
    throw new Error("Exima entitlement is missing");
  }

  const value = entitlement as Record<string, unknown>;
  if (
    typeof value.id !== "string" || !value.id ||
    value.application_id !== requiredEnvironment("HUB_SSO_APP_ID") ||
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
    application_id: value.application_id as string,
    organization_id: value.organization_id,
    role: value.role.toLowerCase(),
    permissions,
    version: value.version,
  };
}

async function lookupCentralEmployee(personId: string) {
  const connection = centralConnection();
  if (!connection) throw new Error("CENTRAL_API_BASE_URL and CENTRAL_API_TOKEN are not configured");
  const url = new URL(`${connection.base}/employees/lookup`);
  url.searchParams.set("person_id", personId);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        authorization: `Bearer ${connection.token}`,
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
  if (!response.ok || !body?.data) throw new Error("Central employee lookup failed");
  return body.data;
}

export async function authenticateHubCode(code: string, state: string) {
  const token = await exchangeHubCode(code, state);
  const relay = await verifyRelayToken(token, {
    audience: requiredEnvironment("HUB_SSO_APP_ID"),
    jwksUrl: process.env.HUB_SSO_JWKS_URL?.trim() || `${hubBaseUrl()}/.well-known/jwks.json`,
    replayStore,
  });
  const entitlement = decodeRelayEntitlement(token);

  if (relay.source !== "employee") throw new Error("Unsupported Central identity source");
  const employee = await lookupCentralEmployee(relay.sub);
  if (employee.person_id !== relay.sub || employee.status.toUpperCase() !== "ACTIVE") {
    throw new Error("Central employee is not active");
  }

  const normalizedEmail = employee.email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail !== relay.email.trim().toLowerCase()) {
    throw new Error("Central identity does not match the Hub relay");
  }

  // The relay entitlement is fresh, so the sign-in gate only looks at what the role carries.
  if (entitlement.permissions.length === 0 && !isBypassEmail(normalizedEmail)) {
    const mode = eximaAccessMode();
    if (mode === "enforce") throw new Error("The Central role carries no Exima permissions");
    if (mode === "warn") console.warn(`[auth] Exima access would be denied: role ${entitlement.role} carries no permissions`);
  }

  const project = () => prisma.$transaction(async (transaction) => {
    const organization = await resolveCentralOrganization(transaction, entitlement.organization_id);
    if (!organization) throw new Error(organizationProblem(entitlement.organization_id));

    const linkedByPerson = await transaction.user.findUnique({ where: { centralPersonId: relay.sub } });
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
        centralPersonId: relay.sub,
        centralEntitlementId: entitlementLink,
      },
    });
    if (existingUser.organizationId !== organization.id) {
      throw new Error("Exima account belongs to another organization");
    }
    if (existingUser.centralPersonId && existingUser.centralPersonId !== relay.sub) {
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
        OR: [{ centralPersonId: null }, { centralPersonId: relay.sub }],
      },
      data: {
        centralPersonId: relay.sub,
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
    // Two first sign-ins at once: the other one made the account, so look again.
    if ((error as { code?: string } | null)?.code === "P2002") return project();
    throw error;
  }
}
