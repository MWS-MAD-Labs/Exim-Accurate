import { centralConnection } from "@/lib/central-config";
import { normalizePermissions } from "@/lib/access-control";

export type CentralEntitlement = {
  id: string;
  organization_id: string;
  role: string;
  permissions: string[];
  version: number;
  is_active: boolean;
};

export type AccessStatus = "granted" | "bypass" | "no_access" | "no_permission" | "central_unavailable";
export type Access = { status: AccessStatus; entitlement: CentralEntitlement | null };

function cacheMs() {
  const seconds = Number(process.env.EXIMA_CENTRAL_ACCESS_CACHE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : 30) * 1000;
}

// Accounts that always get in, so a wrong Central setup cannot lock everyone out.
export function isBypassEmail(email: string) {
  return (process.env.EXIMA_CENTRAL_ACCESS_BYPASS_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase());
}

export async function lookupEntitlement(personId: string): Promise<CentralEntitlement | null> {
  const connection = centralConnection();
  if (!connection) throw new Error("Central API is not configured");
  const { base, token } = connection;
  const url = new URL(`${base}/application-entitlements/lookup`);
  url.searchParams.set("person_id", personId);
  url.searchParams.set("application_id", process.env.HUB_SSO_APP_ID?.trim() || "exima");
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { data?: CentralEntitlement | null; code?: string } | null;
  // Central stopped this application. Nobody has access, so sessions must end.
  if (response.status === 403 && body?.code === "application_retired") return null;
  // Central does not know this person at all: nothing to allow.
  if (response.status === 404) return null;
  if (!response.ok || !body || !("data" in body)) throw new Error("Central entitlement lookup failed");
  return body.data ?? null;
}

const cache = new Map<string, { at: number; entitlement: CentralEntitlement }>();

export function clearAccessCacheForTest() {
  cache.clear();
}

// Only active access is cached, so granting is seen at once and taking it away within the TTL.
export async function resolveAccess(
  person: { email: string; personId: string },
  lookup: (personId: string) => Promise<CentralEntitlement | null> = lookupEntitlement,
): Promise<Access> {
  if (isBypassEmail(person.email)) return { status: "bypass", entitlement: null };

  const cached = cache.get(person.personId);
  let entitlement: CentralEntitlement | null;
  if (cached && Date.now() - cached.at < cacheMs()) {
    entitlement = cached.entitlement;
  } else {
    try {
      entitlement = await lookup(person.personId);
    } catch (error) {
      console.error("[access] Central lookup failed", error instanceof Error ? error.message : error);
      return { status: "central_unavailable", entitlement: null };
    }
    if (entitlement?.is_active) cache.set(person.personId, { at: Date.now(), entitlement });
    else cache.delete(person.personId);
  }

  if (!entitlement?.is_active) return { status: "no_access", entitlement: null };
  // A role that carries nothing Exima knows cannot open anything.
  if (normalizePermissions(entitlement.permissions).length === 0) return { status: "no_permission", entitlement };
  return { status: "granted", entitlement };
}
