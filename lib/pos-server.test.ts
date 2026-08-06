import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeRequestedItems } from "./pos-server";

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
