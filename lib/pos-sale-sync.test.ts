import assert from "node:assert/strict";
import test from "node:test";
import { SYNC_BUDGET_MS, SYNC_SALE_ALLOWANCE_MS, hasTimeForSale, retryDelayMinutes } from "./pos-sale-sync";

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
