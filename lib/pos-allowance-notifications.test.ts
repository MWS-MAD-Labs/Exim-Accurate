import assert from "node:assert/strict";
import test from "node:test";
import { buildNotificationMessage, classifyAllowanceNotification } from "./pos-allowance-notifications";

test("does not notify when a negative charge balance is fully settled", () => {
  assert.equal(classifyAllowanceNotification(-500, 0), null);
});

test("notifies only the outstanding portion of allowance debt", () => {
  assert.deepEqual(classifyAllowanceNotification(-5000, 2000), {
    scenario: "debt",
    amount: 2000,
  });
});

test("notifies a positive unused allowance balance", () => {
  assert.deepEqual(classifyAllowanceNotification(6500, 0), {
    scenario: "remaining_balance",
    amount: 6500,
  });
});

test("allowance notification has a text header and no image", () => {
  const message = buildNotificationMessage({
    name: "Faisal",
    email: "faisal@example.com",
    amount: 6500,
    cutoffDate: new Date("2026-11-11T00:00:00.000Z"),
    reminderDay: 1,
    scenario: "remaining_balance",
  });

  assert.match(message.html, />Sade</);
  assert.doesNotMatch(message.html, /<img /);
});
