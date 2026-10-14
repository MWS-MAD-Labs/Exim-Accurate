import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET as backToHub } from "@/app/auth/hub/route";
import { GET as sso } from "@/app/auth/sso/route";
import { clearAccessCacheForTest } from "@/lib/central-access";
import { HUB_BASE, TEST_ENV, cookieFor, installWorld, newWorld, useEnv } from "@/lib/test-support/hub";

const get = (path: string, cookie = "") => new NextRequest(`https://exima.test${path}`, { headers: cookie ? { cookie } : {} });
const person = { sub: "person-1", email: "kasir@millennia21.id" };

describe("/auth/sso", () => {
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

  it("asks the Hub to restore the session when the browser has none, and brings the person back here", async () => {
    const response = await sso(get("/auth/sso"));
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.origin, HUB_BASE);
    assert.equal(location.pathname, "/auth/restore");
    assert.equal(new URL(location.searchParams.get("return") ?? "").pathname, "/auth/sso");
  });

  it("goes to the Hub front page when the restore already happened, so it cannot loop", async () => {
    const response = await sso(get("/auth/sso?restored=1"));
    assert.equal(response.headers.get("location"), `${HUB_BASE}/`);
  });

  it("tells the person to try again when Central cannot be asked", async () => {
    world.entitlement = "down";
    const response = await sso(get("/auth/sso", cookieFor(person)));
    assert.equal(new URL(response.headers.get("location") ?? "").searchParams.get("error"), "UPSTREAM_UNREACHABLE");
  });

  it("says there is no access for a person Central gave nothing", async () => {
    world.entitlement = null;
    const response = await sso(get("/auth/sso", cookieFor(person)));
    assert.equal(new URL(response.headers.get("location") ?? "").searchParams.get("error"), "no_access");
  });
});

describe("/auth/hub", () => {
  it("goes to the Hub front page, and to the login page when the Hub is not set", async () => {
    const restore = useEnv({ HUB_BASE_URL: HUB_BASE });
    assert.equal((await backToHub(get("/auth/hub"))).headers.get("location"), `${HUB_BASE}/`);
    restore();
    const none = useEnv({ HUB_BASE_URL: undefined });
    assert.equal(new URL((await backToHub(get("/auth/hub"))).headers.get("location") ?? "").pathname, "/login");
    none();
  });
});
