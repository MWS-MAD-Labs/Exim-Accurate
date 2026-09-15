import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { backfillSettledSplitSnapshots } from "./pos-split-backfill";

test("migration applies cumulative split remainders to historical snapshots", () => {
  const sql = readFileSync(
    new URL("../prisma/migrations/20260915120000_account_split_remainders_as_settled_debt/migration.sql", import.meta.url),
    "utf8",
  );

  assert.match(sql, /snapshot_adjustments AS/);
  assert.match(sql, /"priorAdditionalCharge"/);
  assert.match(sql, /"throughAdditionalCharge"/);
  assert.match(sql, /\(split\."createdAt", split\."id"\) < \(target\."createdAt", target\."id"\)/);
  assert.match(sql, /sale\."allowanceBalanceBefore" - snapshot_adjustments\."priorAdditionalCharge"/);
  assert.match(sql, /sale\."allowanceBalanceAfter" - snapshot_adjustments\."throughAdditionalCharge"/);
});

test("shifts later allowance snapshots after migrating a settled split remainder", () => {
  const result = backfillSettledSplitSnapshots([
    {
      id: "split-sale",
      createdAt: new Date("2026-09-01T08:00:00.000Z"),
      allowanceUsed: 10000,
      allowanceBalanceBefore: 10000,
      allowanceBalanceAfter: 0,
      splitExternalRemainder: 5000,
      saleTotal: 15000,
    },
    {
      id: "later-debt-sale",
      createdAt: new Date("2026-09-01T09:00:00.000Z"),
      allowanceUsed: 2000,
      allowanceBalanceBefore: 0,
      allowanceBalanceAfter: -2000,
    },
  ]);

  assert.deepEqual(result.map((sale) => ({
    id: sale.id,
    allowanceUsed: sale.allowanceUsed,
    before: sale.allowanceBalanceBefore,
    after: sale.allowanceBalanceAfter,
  })), [
    { id: "split-sale", allowanceUsed: 15000, before: 10000, after: -5000 },
    { id: "later-debt-sale", allowanceUsed: 2000, before: -5000, after: -7000 },
  ]);
});

test("applies cumulative remainders using created time and id order", () => {
  const createdAt = new Date("2026-09-01T08:00:00.000Z");
  const result = backfillSettledSplitSnapshots([
    { id: "b", createdAt, allowanceUsed: 2000, allowanceBalanceBefore: -3000, allowanceBalanceAfter: -5000 },
    { id: "a", createdAt, allowanceUsed: 7000, allowanceBalanceBefore: 5000, allowanceBalanceAfter: -2000, splitExternalRemainder: 2000, saleTotal: 7000 },
  ]);

  assert.equal(result[0].id, "a");
  assert.equal(result[0].allowanceBalanceAfter, -4000);
  assert.equal(result[1].allowanceBalanceBefore, -5000);
  assert.equal(result[1].allowanceBalanceAfter, -7000);
});
