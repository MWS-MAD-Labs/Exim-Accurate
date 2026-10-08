import assert from "node:assert/strict";
import test from "node:test";
import { buildStatus, isChanged } from "./central-sync-status";

test("never synced counts as changed, an unknown Central key does not", () => {
  assert.equal(isChanged(null, "abc"), true);
  assert.equal(isChanged("abc", "abc"), false);
  assert.equal(isChanged("abc", "def"), true);
  assert.equal(isChanged("abc", null), false);
  assert.equal(isChanged(null, null), false);
});

test("status carries the keys and says when Central could not be asked", () => {
  const at = new Date("2026-10-08T01:00:00Z");
  const same = buildStatus({ key: "abc", syncedAt: at }, "abc");
  assert.deepEqual([same.changed, same.central_available, same.synced_at], [false, true, at.toISOString()]);
  const down = buildStatus({ key: "abc", syncedAt: at }, null);
  assert.deepEqual([down.changed, down.central_available], [false, false]);
});
