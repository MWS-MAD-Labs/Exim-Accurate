import assert from "node:assert/strict";
import test from "node:test";
import { availableQuantity, calculateProfit, isReservationActive, reservationStatusAt } from "./pos";

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
