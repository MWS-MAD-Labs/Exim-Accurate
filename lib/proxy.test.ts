import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { clearAccessCacheForTest } from "@/lib/central-access";
import { HUB_BASE, TEST_ENV, cookieFor, entitlement, hubToken, installWorld, newWorld, otherKey, useEnv } from "@/lib/test-support/hub";
import { proxy } from "../proxy";

const ask = (path: string, cookie = "") =>
  proxy(new NextRequest(`https://exima.test${path}`, { headers: cookie ? { cookie } : {} }));

const person = { sub: "person-1", email: "kasir@millennia21.id" };

// What the proxy does before any account is read: who is signed in, and what happens when nobody is.
describe("proxy", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();

  beforeEach(() => {
    restoreEnv = useEnv({ ...TEST_ENV, EXIMA_CENTRAL_ACCESS_CACHE_SECONDS: "0" });
    clearAccessCacheForTest();
    world = newWorld();
    restoreFetch = installWorld(world);
  });
  afterEach(() => {
    restoreFetch();
    restoreEnv();
  });

  it("answers an API call without a session with 401", async () => {
    const response = await ask("/api/pos/products");
    assert.equal(response.status, 401);
  });

  it("sends a page without a session to the Hub to restore it", async () => {
    const response = await ask("/store");
    assert.equal(response.status, 307);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.origin, HUB_BASE);
    assert.equal(location.pathname, "/auth/restore");
    assert.equal(new URL(location.searchParams.get("return") ?? "").pathname, "/store");
  });

  it("sends a page to the Hub front page when the restore already happened", async () => {
    const response = await ask("/store?restored=1");
    assert.equal(response.headers.get("location"), `${HUB_BASE}/`);
  });

  it("treats a token signed with another key, an expired one and another audience as no session", async () => {
    const bad = [
      `hub_at=${hubToken(person, otherKey)}`,
      `hub_at=${hubToken({ ...person, exp: Math.floor(Date.now() / 1000) - 600 })}`,
      `hub_at=${hubToken({ ...person, aud: "another-app" })}`,
      "hub_at=not-a-token",
    ];
    for (const cookie of bad) assert.equal((await ask("/api/pos/products", cookie)).status, 401);
  });

  it("reads the cookie name set in HUB_ACCESS_COOKIE_NAME and ignores the default one then", async () => {
    const restore = useEnv({ ...TEST_ENV, EXIMA_CENTRAL_ACCESS_CACHE_SECONDS: "0", HUB_ACCESS_COOKIE_NAME: "hub_at_stg" });
    try {
      const token = hubToken(person);
      // 401 means no session. Anything else means the cookie was read as a session.
      assert.notEqual((await ask("/api/pos/products", `hub_at_stg=${token}`)).status, 401);
      assert.equal((await ask("/api/pos/products", `hub_at=${token}`)).status, 401);
    } finally {
      restore();
    }
  });

  it("asks the person to try again when Central cannot be asked", async () => {
    world.entitlement = "down";
    const response = await ask("/api/pos/products", cookieFor(person));
    assert.equal(response.status, 503);
    const page = await ask("/store", cookieFor(person));
    assert.equal(new URL(page.headers.get("location") ?? "").searchParams.get("error"), "UPSTREAM_UNREACHABLE");
  });

  it("answers 403 for a person Central gave no access to Exima", async () => {
    world.entitlement = null;
    assert.equal((await ask("/api/pos/products", cookieFor(person))).status, 403);
    const page = await ask("/store", cookieFor(person));
    assert.equal(new URL(page.headers.get("location") ?? "").searchParams.get("error"), "no_access");
  });

  it("sends the login page to the Hub unless it has a reason to show", async () => {
    assert.equal((await ask("/login")).headers.get("location"), `${HUB_BASE}/`);
    const withReason = await ask("/login?error=no_access");
    assert.equal(withReason.headers.get("location"), null);
  });
});

void entitlement;
