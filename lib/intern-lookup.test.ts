import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { lookupCentralPerson } from "@/lib/central-user-sync";
import { TEST_ENV, installWorld, newWorld, useEnv } from "@/lib/test-support/hub";
import { lookupCentralEmployee } from "@/lib/user-projection";

describe("lookups for an intern", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();
  const intern = { person_id: "person-9", full_name: "An Intern", email: "intern@millennia21.id", status: "ACTIVE" };

  beforeEach(() => {
    restoreEnv = useEnv({ ...TEST_ENV });
    world = newWorld({ intern });
    restoreFetch = installWorld(world);
  });
  afterEach(() => {
    restoreFetch();
    restoreEnv();
  });

  it("finds the profile of an intern after the employee lookup says not found", async () => {
    assert.deepEqual(await lookupCentralEmployee("person-9"), intern);
    assert.deepEqual(world.calls.map((call) => call.split("/").pop()), ["lookup", "lookup"]);
  });

  it("does not ask for an intern when the employee exists", async () => {
    world.employee = { ...intern, full_name: "A Teacher" };
    const profile = await lookupCentralEmployee("person-9");
    assert.equal(profile.full_name, "A Teacher");
    assert.equal(world.calls.length, 1);
  });

  it("fails when the person is neither", async () => {
    world.intern = null;
    await assert.rejects(lookupCentralEmployee("person-9"), /lookup failed/);
  });

  it("counts an intern as a person Central knows", async () => {
    assert.equal(await lookupCentralPerson("person-9"), "exists");
    world.intern = null;
    assert.equal(await lookupCentralPerson("person-9"), "missing");
  });
});
