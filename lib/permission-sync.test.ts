import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { syncPermissionsOnBoot } from "./permission-sync";
import type { RegisteredPermission } from "./central-permissions";

const manifest = [{ key: "a", description: "A" }, { key: "b", description: "B", requires: ["a"] }];
const row = (key: string, requires: string[] = []): RegisteredPermission => ({ key, description: null, requires, source: "MANIFEST", deprecated: false });
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined };
const base = { sleep: async () => undefined, log: quiet };

afterEach(() => {
  delete process.env.EXIMA_PERMISSION_SYNC;
});

test("nothing is sent when Central already has the list", async () => {
  let published = 0;
  const outcome = await syncPermissionsOnBoot(manifest, {
    ...base,
    list: async () => [row("a"), row("b", ["a"])],
    usage: async () => [],
    publish: async () => { published += 1; throw new Error("not expected"); },
  });
  assert.equal(outcome, "in_sync");
  assert.equal(published, 0);
});

test("a new or changed permission is sent, without confirming removals", async () => {
  let args: unknown[] = [];
  const outcome = await syncPermissionsOnBoot(manifest, {
    ...base,
    list: async () => [row("a")],
    usage: async () => [],
    publish: async (...given) => { args = given; return { application_id: "exima", total: 2, added: 1, deprecated: [], affected_roles: [] }; },
  });
  assert.equal(outcome, "published");
  assert.equal(args[2], false);
});

test("a refusal from Central is reported and not retried", async () => {
  let calls = 0;
  const outcome = await syncPermissionsOnBoot(manifest, {
    ...base,
    list: async () => [row("a"), row("old")],
    usage: async () => [],
    publish: async () => { calls += 1; throw new Error("This list drops 3 of 4"); },
  });
  assert.equal(outcome, "refused");
  assert.equal(calls, 1);
});

test("an unreachable Central is retried, then given up on without throwing", async () => {
  let calls = 0;
  const outcome = await syncPermissionsOnBoot(manifest, {
    ...base,
    list: async () => { calls += 1; throw new Error("fetch failed"); },
    usage: async () => [],
  });
  assert.equal(outcome, "unreachable");
  assert.equal(calls, 3);
});

test("it can be switched off", async () => {
  process.env.EXIMA_PERMISSION_SYNC = "off";
  assert.equal(await syncPermissionsOnBoot(manifest, { ...base, list: async () => { throw new Error("no"); } }), "off");
});
