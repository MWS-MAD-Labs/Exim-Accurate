import assert from "node:assert/strict";
import test from "node:test";
import {
  PROVIDER_OUTAGE_COOLDOWN_MS,
  ProviderCooldowns,
  SYNC_BUDGET_MS,
  SYNC_SALE_ALLOWANCE_MS,
  fairSyncCandidates,
  hasTimeForSale,
  isProviderOutageError,
  retryDelayMinutes,
} from "./pos-sale-sync";

test("a failed sale waits 10, 20, 40 minutes and then an hour", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 20].map(retryDelayMinutes), [5, 10, 20, 40, 60, 60, 60]);
});

test("a sale is started only while enough of the run's time is left for it", () => {
  const start = 1_000_000;
  assert.equal(hasTimeForSale(start, start), true);
  assert.equal(hasTimeForSale(start, start + SYNC_BUDGET_MS - SYNC_SALE_ALLOWANCE_MS), true);
  assert.equal(hasTimeForSale(start, start + SYNC_BUDGET_MS - SYNC_SALE_ALLOWANCE_MS + 1), false);
  assert.equal(hasTimeForSale(start, start + SYNC_BUDGET_MS), false);
});

test("the budget leaves room inside the 120 seconds the scheduler waits", () => {
  assert.ok(SYNC_BUDGET_MS <= 100_000);
  assert.ok(SYNC_SALE_ALLOWANCE_MS < SYNC_BUDGET_MS);
});

test("the queue starts with a pending sale when only one slot is available", () => {
  assert.deepEqual(
    fairSyncCandidates([
      { id: "error-1", status: "sync_error" },
      { id: "pending-1", status: "pending_sync" },
    ], 1).map((sale) => sale.id),
    ["pending-1"],
  );
});

test("the queue reserves a slot for both a pending sale and a retry", () => {
  const candidates = [
    { id: "error-1", status: "sync_error" },
    { id: "error-2", status: "sync_error" },
    { id: "error-3", status: "sync_error" },
    { id: "pending-1", status: "pending_sync" },
    { id: "pending-2", status: "pending_sync" },
  ];

  assert.deepEqual(
    fairSyncCandidates(candidates, 3).map((sale) => sale.id),
    ["pending-1", "error-1", "pending-2"],
  );
});

test("a provider outage cools only its credential and then recovers automatically", () => {
  const cooldowns = new ProviderCooldowns();
  const outageAt = 1_000_000;

  cooldowns.recordOutage("credential-a", outageAt);
  assert.equal(cooldowns.isCoolingDown("credential-a", outageAt + PROVIDER_OUTAGE_COOLDOWN_MS - 1), true);
  assert.equal(cooldowns.isCoolingDown("credential-b", outageAt + PROVIDER_OUTAGE_COOLDOWN_MS - 1), false);
  assert.equal(cooldowns.isCoolingDown("credential-a", outageAt + PROVIDER_OUTAGE_COOLDOWN_MS), false);
});

test("only provider 429, 500, 503, and timeout errors trigger an outage cooldown", () => {
  for (const message of [
    "Accurate API request failed with status 429: slow down",
    "Accurate API request failed with status 500: unavailable",
    "Accurate API request failed with status 503: unavailable",
    "Accurate request timed out after 30 seconds",
  ]) {
    assert.equal(isProviderOutageError(new Error(message)), true, message);
  }
  assert.equal(isProviderOutageError(new Error("Accurate API request failed with status 400: bad request")), false);
  assert.equal(isProviderOutageError(new Error("Accurate authorization is missing a required permission")), false);
});
