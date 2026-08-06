import assert from "node:assert/strict";
import test from "node:test";
import {
  availableQuantity,
  calculateMonthlyAllowance,
  calculateProfit,
  calculateRemainingAllowance,
  countWorkingDaysInMonth,
  isReservationActive,
  reservationStatusAt,
  toggleHolidayDate,
} from "./pos";

test("calculates revenue, cost, profit, and margin from immutable line values", () => {
  assert.deepEqual(calculateProfit([
    { itemCode: "A", itemName: "A", quantity: 2, unitPrice: 10, unitCost: 6 },
    { itemCode: "B", itemName: "B", quantity: 1, unitPrice: 5, unitCost: 2 },
  ]), { revenue: 25, cost: 14, profit: 11, margin: 11 / 25 });
});

test("computes sellable quantity after reservation holds", () => {
  assert.equal(availableQuantity(10, 3, 4), 3);
  assert.equal(availableQuantity(10, 11, 1), 0);
});

test("expires only active reservations past their expiry", () => {
  const now = new Date("2026-08-05T10:00:00.000Z");
  const expired = new Date("2026-08-05T09:00:00.000Z");
  assert.equal(isReservationActive("active", expired, now), false);
  assert.equal(reservationStatusAt("active", expired, now), "expired");
  assert.equal(reservationStatusAt("cancelled", expired, now), "cancelled");
});

test("counts Mon-Fri working days in a given month", () => {
  // August 2026: 31 days, starts on a Saturday (Aug 1, 2026 is a Saturday)
  assert.equal(countWorkingDaysInMonth(2026, 8, [1, 2, 3, 4, 5]), 21);
  // Every day counted when all 7 weekdays are "working days"
  assert.equal(countWorkingDaysInMonth(2026, 8, [0, 1, 2, 3, 4, 5, 6]), 31);
});

test("excludes weekday holidays without counting weekend holiday entries", () => {
  assert.equal(
    countWorkingDaysInMonth(2026, 8, [1, 2, 3, 4, 5], ["2026-08-03", "2026-08-08"]),
    20,
  );
});

test("ignores holidays outside the requested month", () => {
  assert.equal(countWorkingDaysInMonth(2026, 8, [1, 2, 3, 4, 5], ["2026-07-31", "2026-09-01"]), 21);
});

test("toggles a holiday back to a working date", () => {
  assert.deepEqual(toggleHolidayDate([], "2026-08-03"), ["2026-08-03"]);
  assert.deepEqual(toggleHolidayDate(["2026-08-03"], "2026-08-03"), []);
});

test("calculates the monthly staff allowance total from a daily rate", () => {
  const total = calculateMonthlyAllowance(
    50000,
    [1, 2, 3, 4, 5],
    new Date("2026-08-15T00:00:00.000Z"),
    ["2026-08-03"],
  );
  assert.equal(total, 20 * 50000);
});

test("clamps remaining allowance at zero and never goes negative", () => {
  assert.equal(calculateRemainingAllowance(100, 40), 60);
  assert.equal(calculateRemainingAllowance(100, 150), 0);
});
