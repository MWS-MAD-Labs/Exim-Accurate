import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { startOfDate } from "./pos";
import { buildPreviousAllowanceDebt, canonicalizeRequestedItems, getStaffPaydayForPeriod, hasOutstandingPosSaleForProduct, reconcileSaleImmediateDebtSettlement, saleTotal } from "./pos-server";

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

test("product snapshot sync is blocked by a queued sale adjustment for the same item", async () => {
  let where: unknown;
  const tx = {
    posSale: {
      findFirst: async (input: { where: unknown }) => {
        where = input.where;
        return { id: "sale-queued" };
      },
    },
  };

  const blocked = await hasOutstandingPosSaleForProduct(tx as never, "credential-1", "ITEM-1");

  assert.equal(blocked, true);
  assert.deepEqual(where, {
    credentialId: "credential-1",
    status: { in: ["pending_sync", "sync_error", "voiding"] },
    items: { some: { itemCode: "ITEM-1" } },
  });
});

test("product snapshot sync can continue when no queued sale uses the item", async () => {
  const tx = { posSale: { findFirst: async () => null } };
  assert.equal(await hasOutstandingPosSaleForProduct(tx as never, "credential-1", "ITEM-1"), false);
});

test("saleTotal calculates sale values with Decimal precision", () => {
  const total = saleTotal([
    { quantity: 3, unitPrice: new Prisma.Decimal("10.25") },
    { quantity: 2, unitPrice: "4.10" },
  ]);
  assert.equal(total.toFixed(2), "38.95");
});


test("upserts an automatic split settlement linked to its sale", async () => {
  let payload: unknown;
  const period = { startsAt: new Date("2026-08-23T00:00:00.000Z"), endsAt: new Date("2026-09-22T00:00:00.000Z") };
  const tx = {
    posStaffAllowanceDebtSettlement: {
      upsert: async (input: unknown) => {
        payload = input;
        return { id: "settlement-1" };
      },
      deleteMany: async () => ({ count: 0 }),
    },
  };
  await reconcileSaleImmediateDebtSettlement(tx as never, {
    saleId: "sale-1",
    credentialId: "credential-1",
    staffEmail: "STAFF@example.com ",
    period,
    createdById: "cashier-1",
    settlement: { method: "cash", amount: new Prisma.Decimal(500) },
  });
  assert.deepEqual(payload, {
    where: { saleId: "sale-1" },
    create: {
      credentialId: "credential-1",
      staffEmail: "staff@example.com",
      periodStartsAt: startOfDate(period.startsAt),
      periodEndsAt: startOfDate(period.endsAt),
      amount: new Prisma.Decimal(500),
      paymentMethod: "cash",
      note: "Automatically settled external remainder from split POS sale",
      createdById: "cashier-1",
      saleId: "sale-1",
    },
    update: {
      credentialId: "credential-1",
      staffEmail: "staff@example.com",
      periodStartsAt: startOfDate(period.startsAt),
      periodEndsAt: startOfDate(period.endsAt),
      amount: new Prisma.Decimal(500),
      paymentMethod: "cash",
      note: "Automatically settled external remainder from split POS sale",
      createdById: "cashier-1",
    },
  });
});

test("removes the automatic settlement when a sale is no longer split", async () => {
  let deletedSaleId: string | undefined;
  const tx = {
    posStaffAllowanceDebtSettlement: {
      upsert: async () => ({ id: "unused" }),
      deleteMany: async (input: { where: { saleId: string } }) => {
        deletedSaleId = input.where.saleId;
        return { count: 1 };
      },
    },
  };
  const result = await reconcileSaleImmediateDebtSettlement(tx as never, {
    saleId: "sale-2",
    credentialId: "credential-1",
    staffEmail: "staff@example.com",
    period: { startsAt: new Date("2026-08-23T00:00:00.000Z"), endsAt: new Date("2026-09-22T00:00:00.000Z") },
    createdById: "cashier-1",
    settlement: null,
  });
  assert.equal(deletedSaleId, "sale-2");
  assert.equal(result, null);
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

test("keeps current-period debt payable without marking it overdue or blocked", () => {
  const period = { startsAt: new Date(2026, 7, 23), endsAt: new Date(2026, 8, 22) };
  const debt = buildPreviousAllowanceDebt(-100, 25, period, null, new Date(2026, 8, 30));
  assert.equal(debt.hasOutstanding, true);
  assert.equal(debt.outstanding, 75);
  assert.equal(debt.payday, null);
  assert.equal(debt.overdue, false);
  assert.equal(debt.blocked, false);
});
