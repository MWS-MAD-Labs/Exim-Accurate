import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptMessage, POS_SALE_RECEIPT_RETRY_ORDER_BY } from "./pos-sale-receipt";

const baseInput = {
  saleId: "sale-123",
  customerName: "Faisal",
  items: [{ itemName: "Kopi", quantity: 2, unitPrice: 12500 }],
  paymentStrategy: "allowance_then_external",
  payments: [{ method: "allowance", amount: 10000 }, { method: "cash", amount: 15000 }],
  total: 25000,
  allowanceBalanceBefore: 85000,
  allowanceBalanceAfter: 75000,
  purchasedAt: new Date("2026-08-22T03:00:00.000Z"),
};

test("buildReceiptMessage formats split allocations and allowance snapshots", () => {
  const message = buildReceiptMessage(baseInput);
  const normalizedText = message.text.replaceAll("\u00a0", "");
  assert.match(message.subject, /Terima kasih sudah berbelanja/);
  assert.match(normalizedText, /Kopi × 2/);
  assert.match(normalizedText, /Allowance Rp10\.000.*Tunai Rp15\.000/);
  assert.match(normalizedText, /Saldo allowance sebelum: Rp85\.000/);
  assert.match(normalizedText, /Saldo allowance sesudah: Rp75\.000/);
});

test("buildReceiptMessage labels explicit allowance debt", () => {
  const message = buildReceiptMessage({
    ...baseInput,
    paymentStrategy: "allowance_debt",
    payments: [{ method: "allowance", amount: 25000 }],
    allowanceBalanceBefore: 0,
    allowanceBalanceAfter: -25000,
  });
  assert.match(message.text, /Allowance debt/);
  assert.match(message.text.replaceAll("\u00a0", ""), /-Rp25\.000|Rp-25\.000/);
  assert.match(message.html, /#fff5f5/);
});

test("buildReceiptMessage escapes customer and item HTML", () => {
  const message = buildReceiptMessage({
    ...baseInput,
    customerName: "<Admin & Staff>",
    items: [{ itemName: "<script>alert('x')</script>", quantity: 1, unitPrice: 1000 }],
  });
  assert.doesNotMatch(message.html, /<script>alert/);
  assert.match(message.html, /&lt;Admin &amp; Staff&gt;/);
  assert.match(message.html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
});

test("retryPosSaleReceipts query order prioritizes never-attempted pending rows before failed rows", () => {
  assert.deepEqual(POS_SALE_RECEIPT_RETRY_ORDER_BY, [
    { receiptEmailAttemptedAt: { sort: "asc", nulls: "first" } },
    { createdAt: "asc" },
  ]);
});
