import assert from "node:assert/strict";
import test from "node:test";
import { syncDotState, syncTooltipLines } from "./sync-label";

const now = Date.parse("2026-10-08T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

test("the tooltip is three short lines", () => {
  assert.deepEqual(syncTooltipLines({ synced_at: ago(300), checked_at: ago(60), last_error: null }, now), [
    "Synced with Central",
    "Checked 1m ago",
    "Last change 5 minutes ago",
  ]);
  assert.deepEqual(syncTooltipLines({ synced_at: null, checked_at: null, last_error: null }, now), [
    "Synced with Central",
    "Not checked yet",
    "Nothing synced yet",
  ]);
});

test("a failing sync says why", () => {
  const lines = syncTooltipLines({ synced_at: ago(7200), checked_at: ago(5), last_error: "Central could not be reached" }, now);
  assert.deepEqual(lines, ["Sync is failing", "Central could not be reached", "Last change 2 hours ago"]);
});

test("the dot is orange when failing and pulses right after a check", () => {
  assert.equal(syncDotState({ checked_at: ago(3), last_error: null }, now), "fresh");
  assert.equal(syncDotState({ checked_at: ago(120), last_error: null }, now), "ok");
  assert.equal(syncDotState({ checked_at: ago(3), last_error: "x" }, now), "failing");
});
