import assert from "node:assert/strict";
import test from "node:test";
import { allocatePayment, PaymentAllocationError } from "./pos-payments";

test("splits positive allowance and cash without creating debt", () => {
  const result = allocatePayment({
    buyerType: "staff",
    saleTotal: "15000.00",
    currentAllowanceBalance: "10000.00",
    intent: { strategy: "allowance_then_external", remainderMethod: "cash", expectedAllowanceAvailable: "10000.00" },
  });
  assert.equal(result.paymentMethod, "split");
  assert.deepEqual(result.payments.map((payment) => [payment.method, payment.amount.toFixed(2)]), [["allowance", "10000.00"], ["cash", "5000.00"]]);
  assert.equal(result.allowanceBalanceAfter?.toFixed(2), "0.00");
});

test("allowance-first cannot create debt when no positive balance exists", () => {
  assert.throws(() => allocatePayment({
    buyerType: "staff",
    saleTotal: "15000.00",
    currentAllowanceBalance: "0.00",
    intent: { strategy: "allowance_then_external", remainderMethod: "qris" },
  }), (error) => error instanceof PaymentAllocationError && error.code === "ALLOWANCE_UNAVAILABLE");
});

test("explicit allowance debt can start or increase a negative balance", () => {
  const zero = allocatePayment({ buyerType: "staff", saleTotal: "15000", currentAllowanceBalance: "0", intent: { strategy: "allowance_debt", debtConfirmed: true } });
  assert.equal(zero.allowanceBalanceAfter?.toFixed(2), "-15000.00");
  const negative = allocatePayment({ buyerType: "staff", saleTotal: "15000", currentAllowanceBalance: "-5000", intent: { strategy: "allowance_debt", debtConfirmed: true } });
  assert.equal(negative.allowanceBalanceAfter?.toFixed(2), "-20000.00");
});

test("stale split expectation returns the latest proposed allocation", () => {
  assert.throws(() => allocatePayment({
    buyerType: "staff",
    saleTotal: "15000",
    currentAllowanceBalance: "7000",
    intent: { strategy: "allowance_then_external", remainderMethod: "cash", expectedAllowanceAvailable: "10000" },
  }), (error) => error instanceof PaymentAllocationError
    && error.code === "ALLOWANCE_CHANGED"
    && JSON.stringify(error.details).includes("8000.00"));
});

test("stale debt expectation requires confirmation again", () => {
  assert.throws(() => allocatePayment({
    buyerType: "staff",
    saleTotal: "15000",
    currentAllowanceBalance: "-5000",
    intent: { strategy: "allowance_debt", debtConfirmed: true, expectedAllowanceBalance: "0" },
  }), (error) => error instanceof PaymentAllocationError
    && error.code === "ALLOWANCE_DEBT_CHANGED"
    && JSON.stringify(error.details).includes("-20000.00"));
});

test("external-only retains Decimal precision", () => {
  const result = allocatePayment({ buyerType: "guest", saleTotal: "25001.25", intent: { strategy: "external_only", method: "qris" } });
  assert.equal(result.payments[0].amount.toFixed(2), "25001.25");
  assert.equal(result.allowanceUsed.toFixed(2), "0.00");
});
