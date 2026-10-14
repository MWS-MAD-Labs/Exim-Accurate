import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";

// A stand in for the Hub in tests: signs access tokens and answers the Hub's key address and Central's entitlement
// lookup, so nothing here touches the network.
export const HUB_BASE = "https://hub.test";
export const CENTRAL_BASE = "https://central.test/api/internal";
const KEY_ID = "test-key";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const b64 = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export type HubClaims = {
  sub: string;
  email: string;
  source?: "employee" | "student";
  iss?: string;
  aud?: string;
  exp?: number;
};

// A signed `hub_at` value. Pass `key` to sign with another key, which the Hub's published key will not match.
export function hubToken(claims: HubClaims, key: KeyObject = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "RS256", kid: KEY_ID, typ: "JWT" }));
  const body = b64(
    JSON.stringify({
      iss: claims.iss ?? "mws-hub",
      aud: claims.aud ?? "mws-apps",
      sub: claims.sub,
      email: claims.email,
      source: claims.source ?? "employee",
      tags: [],
      sid: "family-1",
      jti: randomUUID(),
      iat: now,
      exp: claims.exp ?? now + 300,
    }),
  );
  const signature = sign("RSA-SHA256", Buffer.from(`${head}.${body}`), key);
  return `${head}.${body}.${b64(signature)}`;
}

export const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;

export function cookieFor(claims: HubClaims | null): string {
  return claims ? `hub_at=${hubToken(claims)}` : "";
}

export type Entitlement = { id: string; application_id?: string; organization_id: string; role: string; permissions: string[]; version: number; is_active: boolean };

export function entitlement(over: Partial<Entitlement> = {}): Entitlement {
  return { id: "ent-1", organization_id: "org_exima_test", role: "CASHIER", permissions: ["store.use"], version: 1, is_active: true, ...over };
}

type World = {
  // Central's answer for /application-entitlements/lookup: an entitlement, null (no row), or "down".
  entitlement: Entitlement | null | "down";
  // The person Central returns for /employees/lookup.
  employee: { person_id: string; full_name: string; email: string; status: string } | null;
  calls: string[];
};

export function installWorld(world: World): () => void {
  const original = globalThis.fetch;
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: KEY_ID, alg: "RS256", use: "sig" };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    world.calls.push(`${url.origin}${url.pathname}`);
    if (url.origin === HUB_BASE && url.pathname === "/.well-known/jwks.json") {
      return Response.json({ keys: [jwk] });
    }
    if (url.pathname.endsWith("/application-entitlements/lookup")) {
      if (world.entitlement === "down") return new Response("down", { status: 503 });
      if (world.entitlement === null) return Response.json({ errors: "not found" }, { status: 404 });
      return Response.json({ data: world.entitlement });
    }
    if (url.pathname.endsWith("/employees/lookup")) {
      return world.employee ? Response.json({ data: world.employee }) : Response.json({ errors: "not found" }, { status: 404 });
    }
    throw new Error(`Unexpected fetch in test: ${url.toString()}`);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

export function newWorld(over: Partial<World> = {}): World {
  return { entitlement: null, employee: null, calls: [], ...over };
}

// The environment Exima reads, set for a test and put back after.
export function useEnv(values: Record<string, string | undefined>): () => void {
  const before: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(values)) {
    before[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

export const TEST_ENV = {
  HUB_BASE_URL: HUB_BASE,
  HUB_SSO_APP_ID: "exima",
  CENTRAL_API_BASE_URL: CENTRAL_BASE,
  CENTRAL_API_TOKEN: "prefix.secret",
  CENTRAL_ORGANIZATION_ID: "org_exima_test",
  EXIMA_CENTRAL_ACCESS_BYPASS_EMAILS: undefined,
  NEXTAUTH_URL: undefined,
} as const;
