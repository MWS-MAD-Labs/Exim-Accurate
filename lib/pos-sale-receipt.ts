import { sadeLogoImg, sendEmail } from "@/lib/email";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const LEGACY_ROLE_RESTRICTION_ERROR =
  "Receipt recipient is not a registered staff user in this organization";
const UNREGISTERED_RECIPIENT_ERROR =
  "Receipt recipient is not a registered user in this organization";
const moneyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "long",
  timeStyle: "short",
});

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function paymentMethodLabel(value: string) {
  if (value === "allowance") return "Allowance";
  if (value === "qris") return "QRIS";
  if (value === "cash") return "Tunai";
  return value;
}

// Ganti fungsi buildReceiptMessage yang lama dengan ini.
// Pakai ulang: moneyFormatter, dateFormatter, escapeHtml, paymentMethodLabel (sudah ada di file).
export function buildReceiptMessage(input: {
  saleId: string;
  customerName: string | null;
  items: Array<{ itemName: string; quantity: number; unitPrice: number }>;
  paymentStrategy: string;
  payments: Array<{ method: string; amount: number }>;
  total: number;
  allowanceBalanceBefore: number | null;
  allowanceBalanceAfter: number | null;
  purchasedAt: Date;
}) {
  const greeting = input.customerName?.trim() || "Bapak/Ibu";
  const paymentText = input.payments.map((payment) => `${paymentMethodLabel(payment.method)} ${moneyFormatter.format(payment.amount)}`);
  const externalSettlement = input.paymentStrategy === "allowance_then_external"
    ? input.payments.find((payment) => payment.method === "cash" || payment.method === "qris")
    : undefined;
  const strategyLabel = input.paymentStrategy === "allowance_debt" ? "Allowance debt" : input.paymentStrategy === "allowance_then_external" ? "Allowance first" : "External payment";
  const itemText = input.items.map((item) =>
    `- ${item.itemName} × ${item.quantity}: ${moneyFormatter.format(item.quantity * item.unitPrice)}`,
  );
  const text = [
    `Halo ${greeting},`,
    "",
    "Terima kasih sudah berbelanja di Millennia Mart.",
    "",
    "Detail belanja:",
    ...itemText,
    "",
    `Strategi pembayaran: ${strategyLabel}`,
    `Alokasi pembayaran: ${paymentText.join(" + ")}`,
    `Total pembayaran: ${moneyFormatter.format(input.total)}`,
    ...(input.allowanceBalanceAfter === null ? [] : [
      `Saldo allowance sebelum: ${moneyFormatter.format(input.allowanceBalanceBefore ?? 0)}`,
      `Saldo allowance sesudah dibebankan: ${moneyFormatter.format(input.allowanceBalanceAfter)}`,
      ...(externalSettlement ? [`Utang langsung dibayar via ${paymentMethodLabel(externalSettlement.method)}: ${moneyFormatter.format(externalSettlement.amount)}`] : []),
    ]),
    "",
    `Waktu transaksi: ${dateFormatter.format(input.purchasedAt)}`,
    `Referensi: ${input.saleId}`,
    "",
    "Sampai jumpa di Millennia Mart!",
    "",
    "Millennia Mart · Powered by Sade",
  ].join("\n");

  const headingFont = "'Plus Jakarta Sans','Nunito Sans',Arial,sans-serif";
  const bodyFont = "'Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const logoHtml = sadeLogoImg();

  const solidDivider = `<tr><td colspan="2" style="padding:14px 0;"><div style="height:1px;line-height:1px;font-size:1px;background-color:#D9E2D4;">&nbsp;</div></td></tr>`;
  const dashedDivider = `<tr><td colspan="2" style="padding:12px 0;"><div style="height:0;line-height:0;font-size:0;border-top:1px dashed #D9D2C3;">&nbsp;</div></td></tr>`;

  const itemRows = input.items.map((item) => `<tr>
                      <td valign="top" style="padding:8px 12px 8px 0;">
                        <div style="color:#211F1A;font-size:12px;font-weight:800;line-height:1.5;">${escapeHtml(item.itemName)}</div>
                        <div style="color:#7C776E;font-size:12px;line-height:1.5;">${escapeHtml(moneyFormatter.format(item.unitPrice))} × ${item.quantity}</div>
                      </td>
                      <td align="right" valign="top" style="padding:8px 0;color:#211F1A;font-size:12px;font-weight:800;white-space:nowrap;">${escapeHtml(moneyFormatter.format(item.quantity * item.unitPrice))}</td>
                    </tr>`).join("");

  const paymentRows = input.payments.map((payment) => `<tr>
                      <td style="padding:5px 0;color:#7C776E;font-size:12px;font-weight:700;">${escapeHtml(paymentMethodLabel(payment.method))}</td>
                      <td align="right" style="padding:5px 0;color:#211F1A;font-size:12px;font-weight:800;white-space:nowrap;">${escapeHtml(moneyFormatter.format(payment.amount))}</td>
                    </tr>`).join("");

  const remainingBalance = input.allowanceBalanceAfter;
  const balanceColors = (remainingBalance ?? 0) < 0
    ? { background: "#FFF1F1", border: "#F2B8B8", label: "#8D3E3E", value: "#AD4E4E" }
    : { background: "#F1F4EF", border: "#C1D0B9", label: "#3A5035", value: "#486142" };
  const settlementHtml = externalSettlement
    ? `<div style="margin-top:8px;font-size:12px;line-height:1.6;color:#635F57;">Utang ${escapeHtml(moneyFormatter.format(externalSettlement.amount))} langsung dibayar via ${escapeHtml(paymentMethodLabel(externalSettlement.method))}.</div>`
    : "";

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Terima kasih sudah berbelanja di Millennia Mart</title>
</head>
<body style="margin:0;padding:0;background-color:#FFFFFF;color:#211F1A;font-family:${bodyFont};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#FFFFFF;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;">

          <!-- Header: logo di atas, terang, garis Sage -->
          <tr>
            <td align="center" style="padding:28px 24px 20px;background-color:#FFFFFF;">
              ${logoHtml}
            </td>
          </tr>
          <tr><td style="height:3px;line-height:3px;font-size:3px;background-color:#486142;">&nbsp;</td></tr>

          <!-- Isi -->
          <tr>
            <td style="padding:28px 24px 8px;">
              <h1 style="margin:0 0 14px;color:#211F1A;font-family:${headingFont};font-size:20px;font-weight:800;line-height:1.35;">Terima kasih sudah berbelanja di Millennia Mart</h1>
              <p style="margin:0 0 4px;color:#211F1A;font-size:14px;font-weight:800;line-height:1.6;">Halo ${escapeHtml(greeting)},</p>
              <p style="margin:0 0 20px;color:#635F57;font-size:13px;line-height:1.7;">Transaksi Anda telah berhasil. Berikut rincian belanja Anda.</p>

              <!-- Kartu detail transaksi -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;background-color:#F2F5EF;border:1px solid #DDE5D8;border-radius:14px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        <td style="padding:6px 0;color:#7C776E;font-size:12px;font-weight:700;">Status</td>
                        <td align="right" style="padding:6px 0;"><span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:#E7EEE4;border:1px solid #C1D0B9;color:#486142;font-size:11px;font-weight:800;line-height:1;letter-spacing:0.4px;text-transform:uppercase;">Berhasil</span></td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding:6px 12px 6px 0;color:#7C776E;font-size:12px;font-weight:700;white-space:nowrap;">ID Transaksi</td>
                        <td align="right" style="padding:6px 0;color:#211F1A;font-size:11px;font-weight:800;word-break:break-all;">${escapeHtml(input.saleId)}</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding:6px 12px 6px 0;color:#7C776E;font-size:12px;font-weight:700;white-space:nowrap;">Tanggal</td>
                        <td align="right" style="padding:6px 0;color:#211F1A;font-size:12px;font-weight:800;">${escapeHtml(dateFormatter.format(input.purchasedAt))}</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding:6px 12px 6px 0;color:#7C776E;font-size:12px;font-weight:700;white-space:nowrap;">Metode Pembayaran</td>
                        <td align="right" style="padding:6px 0;color:#211F1A;font-size:12px;font-weight:800;">${escapeHtml(strategyLabel)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Kartu rincian belanja -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:separate;background-color:#FFFFFF;border:1px solid #D9E2D4;border-radius:14px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        <td style="padding:0 0 6px;color:#7C776E;font-size:11px;font-weight:700;">Item</td>
                        <td align="right" style="padding:0 0 6px;color:#7C776E;font-size:11px;font-weight:700;">Total</td>
                      </tr>
                      ${itemRows}
                      ${dashedDivider}
                      ${paymentRows}
                      ${solidDivider}
                      <tr>
                        <td style="color:#211F1A;font-family:${headingFont};font-size:14px;font-weight:800;">Total Bayar</td>
                        <td align="right" style="color:#486142;font-family:${headingFont};font-size:18px;font-weight:800;white-space:nowrap;">${escapeHtml(moneyFormatter.format(input.total))}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Saldo allowance -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:separate;background-color:${balanceColors.background};border:1px solid ${balanceColors.border};border-radius:14px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="color:${balanceColors.label};font-size:11px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;">Saldo allowance setelah dibebankan</div>
                    <div style="margin-top:5px;color:${balanceColors.value};font-family:${headingFont};font-size:22px;font-weight:800;line-height:1.3;">${escapeHtml(remainingBalance === null ? "Tidak digunakan" : moneyFormatter.format(remainingBalance))}</div>
                    ${settlementHtml}
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 20px;color:#635F57;font-size:13px;line-height:1.7;">Sampai jumpa di Millennia Mart!</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px;background-color:#486142;">
              <p style="margin:0 0 14px;color:#E6EBE2;font-size:11px;line-height:1.6;">Email ini dikirim otomatis setelah transaksi Anda.</p>
              <div style="height:1px;line-height:1px;font-size:1px;background-color:#6F8B6A;">&nbsp;</div>
              <p style="margin:14px 0 0;color:#E6EBE2;font-size:11px;line-height:1.6;">Millennia Mart · Powered by Sade</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: "Terima kasih sudah berbelanja di Millennia Mart",
    text,
    html,
  };
}
export function receiptPurchasedAt(sale: { createdAt: Date; syncedAt?: Date | null }) {
  return sale.createdAt;
}

export async function sendPosSaleReceipt(saleId: string) {
  let claimed = false;
  try {
    const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
    const claim = await prisma.posSale.updateMany({
      where: {
        id: saleId,
        status: "synced",
        buyerType: "staff",
        staffEmail: { not: null },
        OR: [
          { receiptEmailStatus: { in: ["pending", "failed"] } },
          {
            receiptEmailStatus: "disabled",
            receiptEmailError: LEGACY_ROLE_RESTRICTION_ERROR,
          },
          { receiptEmailStatus: "processing", receiptEmailAttemptedAt: { lt: staleBefore } },
        ],
      },
      data: {
        receiptEmailStatus: "processing",
        receiptEmailAttemptedAt: new Date(),
        receiptEmailError: null,
      },
    });
    if (claim.count !== 1) return { status: "skipped" as const };
    claimed = true;

    const sale = await prisma.posSale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        payments: { orderBy: { createdAt: "asc" } },
        credential: { select: { organizationId: true } },
      },
    });
    if (!sale?.staffEmail) throw new Error("Sale receipt data is incomplete");

    // The receipt goes to the email the person has now, found by the person id when the sale has one.
    const registeredStaff = await prisma.user.findFirst({
      where: {
        organizationId: sale.credential.organizationId,
        ...(sale.staffPersonId
          ? { centralPersonId: sale.staffPersonId }
          : { email: { equals: sale.staffEmail.trim(), mode: "insensitive" as const } }),
      },
      select: { id: true, name: true, email: true },
    });
    if (!registeredStaff) {
      await prisma.posSale.update({
        where: { id: sale.id },
        data: {
          receiptEmailStatus: "disabled",
          receiptEmailError: UNREGISTERED_RECIPIENT_ERROR,
        },
      });
      return { status: "disabled" as const };
    }

    const items = sale.items.map((item) => ({
      itemName: item.itemName,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
    }));
    const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    await sendEmail({
      to: registeredStaff.email.toLowerCase(),
      ...buildReceiptMessage({
        saleId: sale.id,
        customerName: registeredStaff.name ?? sale.staffName,
        items,
        paymentStrategy: sale.paymentStrategy,
        payments: sale.payments.map((payment) => ({ method: payment.method, amount: Number(payment.amount) })),
        total,
        allowanceBalanceBefore: sale.allowanceBalanceBefore === null ? null : Number(sale.allowanceBalanceBefore),
        allowanceBalanceAfter: sale.allowanceBalanceAfter === null ? null : Number(sale.allowanceBalanceAfter),
        purchasedAt: receiptPurchasedAt(sale),
      }),
    });
    await prisma.posSale.update({
      where: { id: sale.id },
      data: { receiptEmailStatus: "sent", receiptEmailSentAt: new Date(), receiptEmailError: null },
    });
    return { status: "sent" as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown receipt email error";
    if (claimed) {
      await prisma.posSale.updateMany({
        where: { id: saleId, receiptEmailStatus: "processing" },
        data: { receiptEmailStatus: "failed", receiptEmailError: message.slice(0, 2000) },
      }).catch((persistenceError) => {
        console.error(`[pos-sale-receipt] Could not persist failure for sale ${saleId}`, persistenceError);
      });
    }
    console.error(`[pos-sale-receipt] Delivery failed for sale ${saleId}`, error);
    return { status: "failed" as const };
  }
}

export const POS_SALE_RECEIPT_RETRY_ORDER_BY: Prisma.PosSaleOrderByWithRelationInput[] = [
  { receiptEmailAttemptedAt: { sort: "asc", nulls: "first" } },
  { createdAt: "asc" },
];

// Retries stale `processing` sales using an at-least-once delivery pattern with a 15-minute claim timeout.
export async function retryPosSaleReceipts(input: { credentialId?: string; limit?: number } = {}) {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS);
  const sales = await prisma.posSale.findMany({
    where: {
      ...(input.credentialId ? { credentialId: input.credentialId } : {}),
      status: "synced",
      buyerType: "staff",
      staffEmail: { not: null },
      OR: [
        { receiptEmailStatus: { in: ["pending", "failed"] } },
        {
          receiptEmailStatus: "disabled",
          receiptEmailError: LEGACY_ROLE_RESTRICTION_ERROR,
        },
        { receiptEmailStatus: "processing", receiptEmailAttemptedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: POS_SALE_RECEIPT_RETRY_ORDER_BY,
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  const summary = { attempted: sales.length, sent: 0, failed: 0, disabled: 0, skipped: 0 };
  for (const sale of sales) {
    const result = await sendPosSaleReceipt(sale.id);
    summary[result.status] += 1;
  }
  return summary;
}
