import assert from "node:assert/strict";
import test from "node:test";
import { recordValidatedDebtSettlement, validateDebtSettlement, type PayableDebtStatus } from "./pos-debt-settlement";

const currentPeriod = { startsAt: new Date(2026, 7, 23), endsAt: new Date(2026, 8, 22) };
const previousPeriod = { startsAt: new Date(2026, 6, 23), endsAt: new Date(2026, 7, 22) };

function debt(period: typeof currentPeriod, outstanding: number): PayableDebtStatus {
  return {
    hasOutstanding: outstanding > 0,
    outstanding,
    period: { startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString() },
  };
}

test("validates current and previous period debt payments", () => {
  assert.equal(validateDebtSettlement({
    requestedPeriod: currentPeriod,
    amount: 25,
    currentDebt: debt(currentPeriod, 100),
    previousDebt: debt(previousPeriod, 50),
  }), "current");
  assert.equal(validateDebtSettlement({
    requestedPeriod: previousPeriod,
    amount: 50,
    currentDebt: debt(currentPeriod, 100),
    previousDebt: debt(previousPeriod, 50),
  }), "previous");
});

test("rejects excessive, paid, and non-payable debt periods", () => {
  assert.throws(() => validateDebtSettlement({
    requestedPeriod: currentPeriod,
    amount: 101,
    currentDebt: debt(currentPeriod, 100),
    previousDebt: debt(previousPeriod, 50),
  }), /PAYMENT_EXCEEDS_DEBT/);
  assert.throws(() => validateDebtSettlement({
    requestedPeriod: currentPeriod,
    amount: 1,
    currentDebt: debt(currentPeriod, 0),
    previousDebt: debt(previousPeriod, 50),
  }), /DEBT_ALREADY_PAID/);
  assert.throws(() => validateDebtSettlement({
    requestedPeriod: { startsAt: new Date(2026, 5, 23), endsAt: new Date(2026, 6, 22) },
    amount: 1,
    currentDebt: debt(currentPeriod, 100),
    previousDebt: debt(previousPeriod, 50),
  }), /DEBT_PERIOD_CHANGED/);
});

test("persists one partial or full current-period settlement after transactional validation", async () => {
  for (const amount of [25, 100]) {
    let createCalls = 0;
    const created = await recordValidatedDebtSettlement({
      requestedPeriod: currentPeriod,
      amount,
      loadDebts: async () => ({ currentDebt: debt(currentPeriod, 100), previousDebt: debt(previousPeriod, 0) }),
      createSettlement: async () => {
        createCalls += 1;
        return { amount };
      },
    });
    assert.deepEqual(created, { amount });
    assert.equal(createCalls, 1);
  }
});

test("does not persist when transactional debt validation fails", async () => {
  let createCalls = 0;
  await assert.rejects(recordValidatedDebtSettlement({
    requestedPeriod: currentPeriod,
    amount: 101,
    loadDebts: async () => ({ currentDebt: debt(currentPeriod, 100), previousDebt: debt(previousPeriod, 0) }),
    createSettlement: async () => {
      createCalls += 1;
      return {};
    },
  }), /PAYMENT_EXCEEDS_DEBT/);
  assert.equal(createCalls, 0);
});
