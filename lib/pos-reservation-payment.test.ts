import assert from "node:assert/strict";
import test from "node:test";
import { allocatePayment, PaymentAllocationError } from "./pos-payments";
import { reservationRequestSchema } from "./pos";
import { reservationPickupPaymentIntent, approvedReservationDebt, reservationCheckoutPaymentSchema, assertReservationDebtAuthorized, reservationPaymentIntent, ReservationPaymentError } from "./pos-reservation-payment";

for (const method of ["cash", "qris"] as const) {
  test(`derives stored ${method} and allowance-first ${method} choices`, () => {
    assert.deepEqual(reservationPaymentIntent({ paymentStrategy: "external_only", externalPaymentMethod: method }), { strategy: "external_only", method });
    assert.deepEqual(reservationPaymentIntent({ paymentStrategy: "allowance_then_external", externalPaymentMethod: method }), { strategy: "allowance_then_external", remainderMethod: method });
  });
}

test("does not fall back to the legacy projection or accept caller payment overrides", () => {
  const stored = { paymentStrategy: "external_only", externalPaymentMethod: "qris", preferredPaymentMethod: "cash", payment: { strategy: "allowance_debt", debtConfirmed: true } };
  assert.deepEqual(reservationPaymentIntent(stored), { strategy: "external_only", method: "qris" });
  for (const paymentStrategy of ["external_only", "allowance_then_external", "unknown"]) {
    assert.throws(() => reservationPaymentIntent({ paymentStrategy, externalPaymentMethod: null }), ReservationPaymentError);
  }
  assert.throws(() => reservationPaymentIntent({ paymentStrategy: "external_only", externalPaymentMethod: "card" }), ReservationPaymentError);
  assert.throws(() => reservationPaymentIntent({ paymentStrategy: "allowance_debt", externalPaymentMethod: "cash" }), ReservationPaymentError);
});

test("stored debt strategy cannot create or increase debt without a persisted authorization cap", () => {
  const intent = reservationPaymentIntent({ paymentStrategy: "allowance_debt", externalPaymentMethod: null });
  for (const balance of ["99.99", "0", "-50"]) {
    const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: balance, intent });
    assert.throws(() => assertReservationDebtAuthorized(allocation), (error) => error instanceof ReservationPaymentError && error.code === "RESERVATION_DEBT_AUTHORIZATION_REQUIRED");
  }
  for (const balance of ["100", "150"]) {
    const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: balance, intent });
    assert.throws(() => assertReservationDebtAuthorized(allocation), ReservationPaymentError);
    assert.doesNotThrow(() => assertReservationDebtAuthorized(allocation, "0"));
  }
});

test("stored split retains immediate settlement and never falls back to unpaid debt", () => {
  const intent = reservationPaymentIntent({ paymentStrategy: "allowance_then_external", externalPaymentMethod: "qris" });
  const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "40", intent });
  assert.doesNotThrow(() => assertReservationDebtAuthorized(allocation));
  assert.equal(allocation.immediateDebtSettlement?.method, "qris");
  assert.equal(allocation.immediateDebtSettlement?.amount.toFixed(2), "60.00");
  for (const balance of ["0", "-10"]) {
    assert.throws(() => allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: balance, intent }));
  }
});

test("checkout validates and persists resulting debt including pre-existing debt", () => {
  const payment = reservationCheckoutPaymentSchema.parse({ strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt: "150.25" });
  const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100.25", currentAllowanceBalance: "-50", intent: payment });
  const approved = approvedReservationDebt(payment, allocation);
  assert.equal(approved?.toFixed(2), "150.25");
  assert.doesNotThrow(() => assertReservationDebtAuthorized(allocation, approved));
  for (const expectedResultingDebt of ["150.24", "150.26"]) {
    assert.throws(() => approvedReservationDebt({ ...payment, expectedResultingDebt }, allocation), (error) => error instanceof ReservationPaymentError && error.details.expectedResultingDebt === "150.25");
  }
  assert.throws(() => approvedReservationDebt({ strategy: "allowance_debt" }, allocation), ReservationPaymentError);
});

test("pickup permits equal or lower resulting debt but rejects a one-cent increase", () => {
  const intent = reservationPaymentIntent({ paymentStrategy: "allowance_debt", externalPaymentMethod: null });
  for (const balance of ["-50", "0", "200"]) {
    const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: balance, intent });
    assert.doesNotThrow(() => assertReservationDebtAuthorized(allocation, "150"));
  }
  const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "-50.01", intent });
  assert.throws(() => assertReservationDebtAuthorized(allocation, "150"), (error) => error instanceof ReservationPaymentError && error.code === "RESERVATION_DEBT_LIMIT_EXCEEDED");
});

test("split checkout expectation is applied allowance, not the full balance", () => {
  const payment = reservationCheckoutPaymentSchema.parse({ strategy: "allowance_then_external", remainderMethod: "cash", expectedAllowanceAmount: "100.00" });
  const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "200", intent: payment });
  assert.equal(approvedReservationDebt(payment, allocation), null);
  assert.throws(() => approvedReservationDebt({ ...payment, expectedAllowanceAmount: "200" }, allocation), (error) => error instanceof ReservationPaymentError && error.details.expectedAllowanceAmount === "100.00");
});

test("reservation request preserves the store payment expectations", () => {
  const base = { idempotencyKey: "preorder-test-key", items: [{ itemCode: "A", quantity: 1 }] };
  for (const payment of [
    { strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt: "150.25" },
    { strategy: "allowance_then_external", remainderMethod: "qris", expectedAllowanceAmount: "40.00" },
    { strategy: "external_only", method: "cash" },
  ]) {
    assert.deepEqual(reservationRequestSchema.parse({ ...base, payment }).payment, payment);
  }
  assert.equal(reservationRequestSchema.safeParse({ ...base, payment: { strategy: "allowance_debt", debtConfirmed: true } }).success, false);
});

test("zero approved debt is persisted and cannot authorize later debt", () => {
  const payment = reservationCheckoutPaymentSchema.parse({ strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt: "0.00" });
  const allocation = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "150", intent: payment });
  const approved = approvedReservationDebt(payment, allocation);
  assert.equal(approved?.toFixed(2), "0.00");
  const later = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "99.99", intent: payment });
  assert.throws(() => assertReservationDebtAuthorized(later, approved), ReservationPaymentError);
});

test("debt checkout requires explicit nonnegative decimal expectation and confirmation", () => {
  for (const expectedResultingDebt of [undefined, "-1", "1.001", "NaN", "1000000000000", 100]) {
    assert.equal(reservationCheckoutPaymentSchema.safeParse({ strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt }).success, false);
  }
  assert.equal(reservationCheckoutPaymentSchema.safeParse({ strategy: "allowance_debt", debtConfirmed: false, expectedResultingDebt: "0" }).success, false);
  assert.equal(reservationCheckoutPaymentSchema.safeParse({ strategy: "allowance_debt", debtConfirmed: true, expectedResultingDebt: "0.00" }).success, true);
});

for (const method of ["cash", "qris"] as const) {
  test(`split ${method} pickup rejects stale preview and accepts explicit reconfirmation`, () => {
    const reservation = { paymentStrategy: "allowance_then_external", externalPaymentMethod: method };
    const intent = reservationPickupPaymentIntent(reservation, {
      expectedAllowanceAvailable: "80.00",
      payment: { strategy: "external_only", method: method === "cash" ? "qris" : "cash" },
      paymentMethod: "allowance",
    });
    assert.deepEqual(intent, { strategy: "allowance_then_external", remainderMethod: method, expectedAllowanceAvailable: "80.00" });
    let details: Record<string, unknown> = {};
    assert.throws(() => allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "40", intent }), (error) => {
      if (!(error instanceof PaymentAllocationError) || error.code !== "ALLOWANCE_CHANGED") return false;
      details = error.details;
      return true;
    });
    assert.deepEqual(details.proposedPayments, [{ method: "allowance", amount: "40.00" }, { method, amount: "60.00" }]);
    const current = (details.allowance as { currentlyAvailable: string }).currentlyAvailable;
    const reconfirmed = reservationPickupPaymentIntent(reservation, { expectedAllowanceAvailable: current });
    const result = allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "40", intent: reconfirmed });
    assert.equal(result.immediateDebtSettlement?.amount.toFixed(2), "60.00");
    assert.equal(result.immediateDebtSettlement?.method, method);
  });
}

test("split pickup requires a valid preview and never substitutes server balance", () => {
  const reservation = { paymentStrategy: "allowance_then_external", externalPaymentMethod: "cash" };
  for (const confirmation of [null, {}, { expectedAllowanceAvailable: "-1" }, { expectedAllowanceAvailable: 40 }, { expectedAllowanceAvailable: "NaN" }]) {
    assert.throws(() => reservationPickupPaymentIntent(reservation, confirmation));
  }
  const intent = reservationPickupPaymentIntent(reservation, { expectedAllowanceAvailable: "200.00" });
  assert.doesNotThrow(() => allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "200", intent }));
  assert.throws(() => allocatePayment({ buyerType: "staff", saleTotal: "100", currentAllowanceBalance: "0", intent }), (error) => error instanceof PaymentAllocationError && error.code === "ALLOWANCE_UNAVAILABLE" && error.details.currentBalance === "0.00");
});

test("non-split pickup needs no preview and ignores attempted method overrides", () => {
  assert.deepEqual(reservationPickupPaymentIntent({ paymentStrategy: "external_only", externalPaymentMethod: "qris" }, { paymentMethod: "cash" }), { strategy: "external_only", method: "qris" });
  assert.deepEqual(reservationPickupPaymentIntent({ paymentStrategy: "allowance_debt", externalPaymentMethod: null }, null), { strategy: "allowance_debt", debtConfirmed: true });
});

test("stored external payment passes the debt guard without an allowance balance", () => {
  const intent = reservationPaymentIntent({ paymentStrategy: "external_only", externalPaymentMethod: "cash" });
  assert.doesNotThrow(() => assertReservationDebtAuthorized(allocatePayment({ buyerType: "staff", saleTotal: "100", intent })));
});
