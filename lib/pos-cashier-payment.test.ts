import assert from "node:assert/strict";
import test from "node:test";
import {
  canToggleAllowanceFirst,
  getCashierPaymentBreakdown,
  selectExternalPaymentMethod,
  toggleAllowanceFirst,
} from "./pos-cashier-payment";

test("cash selection preserves allowance-first mode", () => {
  assert.equal(selectExternalPaymentMethod("allowance_first_cash", "cash"), "allowance_first_cash");
  assert.equal(selectExternalPaymentMethod("allowance_first_qris", "cash"), "allowance_first_cash");
});

test("qris selection preserves allowance-first mode", () => {
  assert.equal(selectExternalPaymentMethod("allowance_first_cash", "qris"), "allowance_first_qris");
  assert.equal(selectExternalPaymentMethod("allowance_first_qris", "qris"), "allowance_first_qris");
});

test("external method selection remains full payment outside allowance-first mode", () => {
  assert.equal(selectExternalPaymentMethod(null, "cash"), "cash");
  assert.equal(selectExternalPaymentMethod("allowance_debt", "qris"), "qris");
});

test("only the allowance-first control disables an eligible allowance-first mode", () => {
  assert.equal(toggleAllowanceFirst("cash"), "allowance_first_cash");
  assert.equal(toggleAllowanceFirst("allowance_first_qris"), null);
});

test("allowance-first can still be disabled after allowance becomes unavailable", () => {
  const selected = "allowance_first_cash" as const;
  const canUseAllowanceFirstAfterRefresh = false;

  assert.equal(canToggleAllowanceFirst(selected, canUseAllowanceFirstAfterRefresh), true);
  assert.equal(toggleAllowanceFirst(selected), null);
});

test("external payment exits stale allowance-first mode after allowance becomes unavailable", () => {
  const selected = "allowance_first_qris" as const;
  const canUseAllowanceFirstAfterRefresh = false;

  assert.equal(selectExternalPaymentMethod(selected, "cash", canUseAllowanceFirstAfterRefresh), "cash");
  assert.equal(selectExternalPaymentMethod(selected, "qris", canUseAllowanceFirstAfterRefresh), "qris");
});

test("payment breakdown matches allowance-first cash allocation", () => {
  assert.deepEqual(getCashierPaymentBreakdown({
    choice: "allowance_first_cash",
    total: 7000,
    allowanceBalance: 6500,
  }), {
    allowanceAmount: 6500,
    externalAmount: 500,
    externalMethod: "cash",
    allowanceBalanceAfter: -500,
    immediatelySettledDebt: 500,
  });
});

test("full cash leaves allowance unchanged", () => {
  assert.deepEqual(getCashierPaymentBreakdown({
    choice: "cash",
    total: 7000,
    allowanceBalance: 6500,
  }), {
    allowanceAmount: 0,
    externalAmount: 7000,
    externalMethod: "cash",
    allowanceBalanceAfter: 6500,
    immediatelySettledDebt: 0,
  });
});
