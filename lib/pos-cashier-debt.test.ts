import assert from "node:assert/strict";
import test from "node:test";
import { retryDebtAllowanceRefresh, settleDebtPaymentAndRefresh } from "./pos-cashier-debt";

test("successful settlement with failed refresh requires refresh without retrying settlement", async () => {
  let settlementCalls = 0;
  let refreshCalls = 0;
  const result = await settleDebtPaymentAndRefresh({
    periodType: "current",
    settle: async () => {
      settlementCalls += 1;
      return { ok: true, data: {} };
    },
    refresh: async () => {
      refreshCalls += 1;
      throw new Error("offline");
    },
  });

  assert.deepEqual(result, { kind: "refresh_required", paymentRecorded: true, response: { ok: true, data: {} } });
  assert.equal(settlementCalls, 1);
  assert.equal(refreshCalls, 1);

  const freshAllowance = { remaining: -25, used: 125, period: "new", currentDebt: { outstanding: 25 } };
  const refreshed = await retryDebtAllowanceRefresh(async () => {
    refreshCalls += 1;
    return freshAllowance;
  });
  assert.strictEqual(refreshed, freshAllowance);
  assert.equal(settlementCalls, 1);
  assert.equal(refreshCalls, 2);
});

test("successful settlement returns the complete refreshed allowance snapshot", async () => {
  const freshAllowance = { total: 100, used: 125, remaining: -25, period: { startsAt: "new" } };
  const result = await settleDebtPaymentAndRefresh({
    periodType: "current",
    settle: async () => ({ ok: true, data: {} }),
    refresh: async () => freshAllowance,
  });

  assert.equal(result.kind, "refreshed");
  if (result.kind === "refreshed") assert.strictEqual(result.allowance, freshAllowance);
});

test("rejected settlement does not refresh unless it is a recognized debt conflict", async () => {
  let refreshCalls = 0;
  await assert.rejects(
    settleDebtPaymentAndRefresh({
      periodType: "current",
      settle: async () => ({ ok: false, data: { error: "Forbidden" } }),
      refresh: async () => {
        refreshCalls += 1;
        return {};
      },
    }),
    /Forbidden/,
  );
  assert.equal(refreshCalls, 0);
});
