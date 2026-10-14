import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { clearAccessCacheForTest } from "@/lib/central-access";
import { CentralUnavailableError, resolveSessionUser } from "@/lib/session";
import { TEST_ENV, entitlement, installWorld, newWorld, useEnv } from "@/lib/test-support/hub";

// The paths that end before the database. The ones that write the account are in tests/integration.
describe("resolveSessionUser without the database", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();
  const person = { sub: "person-1", email: "kasir@millennia21.id", source: "employee" as const };

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

  it("gives a student nothing and does not ask Central", async () => {
    assert.equal(await resolveSessionUser({ ...person, source: "student" }), null);
    assert.deepEqual(world.calls, []);
  });

  it("says so when Central cannot be asked, so the caller can tell the person to try again", async () => {
    world.entitlement = "down";
    await assert.rejects(resolveSessionUser(person), CentralUnavailableError);
  });

  it("gives nothing to a person Central has no access for", async () => {
    world.entitlement = null;
    assert.equal(await resolveSessionUser(person), null);
  });

  it("gives nothing when the access was taken away", async () => {
    world.entitlement = entitlement({ is_active: false });
    assert.equal(await resolveSessionUser(person), null);
  });

  it("gives nothing when the role carries nothing Exima knows", async () => {
    world.entitlement = entitlement({ permissions: [] });
    assert.equal(await resolveSessionUser(person), null);
  });
});
