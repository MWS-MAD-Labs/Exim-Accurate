import assert from "node:assert/strict";
import test from "node:test";
import { buildReceiptMessage, POS_SALE_RECEIPT_RETRY_ORDER_BY } from "./pos-sale-receipt";

const baseInput = {
  saleId: "sale-123",
  customerName: "Faisal",
  items: [{ itemName: "Kopi", quantity: 2, unitPrice: 12500 }],
  paymentMethod: "allowance",
  total: 25000,
  remainingBalance: 75000,
  purchasedAt: new Date("2026-08-22T03:00:00.000Z"),
};

test("buildReceiptMessage formats items, totals, allowance, and payment labels", () => {
  const message = buildReceiptMessage(baseInput);
  const normalizedText = message.text.replaceAll("\u00a0", "");
  assert.match(message.subject, /Terima kasih sudah berbelanja/);
  assert.match(normalizedText, /Kopi × 2/);
  assert.match(normalizedText, /Rp25\.000/);
  assert.match(normalizedText, /Rp75\.000/);
  assert.match(normalizedText, /Metode pembayaran: Allowance/);

  const cash = buildReceiptMessage({ ...baseInput, paymentMethod: "cash" });
  assert.match(cash.text, /Metode pembayaran: Tunai/);
  const qris = buildReceiptMessage({ ...baseInput, paymentMethod: "qris" });
  assert.match(qris.text, /Metode pembayaran: QRIS/);
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

test("buildReceiptMessage uses warning styling for a negative balance", () => {
  const message = buildReceiptMessage({ ...baseInput, remainingBalance: -5000 });
  assert.match(message.text.replaceAll("\u00a0", ""), /-Rp5\.000|Rp-5\.000/);
  assert.match(message.html, /#fff5f5/);
  assert.match(message.html, /#e03131/);
});

test("retryPosSaleReceipts query order prioritizes never-attempted pending rows before failed rows", () => {
  assert.deepEqual(POS_SALE_RECEIPT_RETRY_ORDER_BY, [
    { receiptEmailAttemptedAt: { sort: "asc", nulls: "first" } },
    { createdAt: "asc" },
  ]);
});
