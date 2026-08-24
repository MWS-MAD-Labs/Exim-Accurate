import assert from "node:assert/strict";
import test from "node:test";
import { buildPreviousAllowanceDebt, canonicalizeRequestedItems, getStaffPaydayForPeriod } from "./pos-server";

test("canonicalizeRequestedItems merges duplicate item codes into a single line", () => {
  const result = canonicalizeRequestedItems([
    { itemCode: "A", quantity: 1 },
    { itemCode: "A", quantity: 2 },
    { itemCode: "B", quantity: 3 },
  ]);
  assert.deepEqual(result, [
    { itemCode: "A", quantity: 3 },
    { itemCode: "B", quantity: 3 },
  ]);
});

test("canonicalizeRequestedItems returns unique-length output shorter than duplicated input", () => {
  const requested = [
    { itemCode: "A", quantity: 1 },
    { itemCode: "A", quantity: 2 },
  ];
  const result = canonicalizeRequestedItems(requested);
  assert.equal(result.length, 1);
  assert.notEqual(result.length, requested.length);
});

test("uses the first staff salary payday on or after the new allowance period starts", () => {
  assert.deepEqual(
    getStaffPaydayForPeriod({ startsAt: new Date(2026, 7, 23), endsAt: new Date(2026, 8, 22) }, 28),
    new Date(2026, 7, 28),
  );
  assert.deepEqual(
    getStaffPaydayForPeriod({ startsAt: new Date(2026, 7, 23), endsAt: new Date(2026, 8, 22) }, 15),
    new Date(2026, 8, 15),
  );
});

test("allows transactions through payday and blocks unpaid previous debt the next day", () => {
  const period = { startsAt: new Date(2026, 6, 23), endsAt: new Date(2026, 7, 22) };
  const payday = new Date(2026, 7, 28);
  const onPayday = buildPreviousAllowanceDebt(-100, 25, period, payday, new Date(2026, 7, 28, 23, 59));
  assert.equal(onPayday.hasOutstanding, true);
  assert.equal(onPayday.blocked, false);
  const afterPayday = buildPreviousAllowanceDebt(-100, 25, period, payday, new Date(2026, 7, 29));
  assert.equal(afterPayday.blocked, true);
  assert.equal(afterPayday.outstanding, 75);
});
