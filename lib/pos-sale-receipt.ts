import { sendEmail } from "@/lib/email";
import { getStaffAllowance } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
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

export function buildReceiptMessage(input: {
  saleId: string;
  customerName: string | null;
  items: Array<{ itemName: string; quantity: number; unitPrice: number }>;
  paymentMethod: string;
  total: number;
  remainingBalance: number;
  purchasedAt: Date;
}) {
  const greeting = input.customerName?.trim() || "Bapak/Ibu";
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
    `Metode pembayaran: ${paymentMethodLabel(input.paymentMethod)}`,
    `Total pembayaran: ${moneyFormatter.format(input.total)}`,
    `Sisa saldo allowance: ${moneyFormatter.format(input.remainingBalance)}`,
    "",
    `Waktu transaksi: ${dateFormatter.format(input.purchasedAt)}`,
    `Referensi: ${input.saleId}`,
    "",
    "Sampai jumpa di Millennia Mart!",
  ].join("\n");

  const itemRows = input.items.map((item, index) => {
    const background = index % 2 === 0 ? "#ffffff" : "#f8f9fa";
    return `<tr style="background:${background}"><td style="padding:14px 16px;color:#343a40;border-bottom:1px solid #e9ecef"><div style="font-weight:600">${escapeHtml(item.itemName)}</div><div style="font-size:12px;color:#868e96;margin-top:3px">${escapeHtml(moneyFormatter.format(item.unitPrice))} × ${item.quantity}</div></td><td style="padding:14px 16px;text-align:right;font-weight:600;color:#343a40;border-bottom:1px solid #e9ecef;white-space:nowrap">${escapeHtml(moneyFormatter.format(item.quantity * item.unitPrice))}</td></tr>`;
  }).join("");

  const balanceColors = input.remainingBalance < 0
    ? { background: "#fff5f5", border: "#ffc9c9", label: "#c92a2a", value: "#e03131" }
    : { background: "#ebfbee", border: "#b2f2bb", label: "#2b8a3e", value: "#2f9e44" };
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f3f5;font-family:Inter,Arial,sans-serif;color:#343a40"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f3f5;padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08)"><tr><td style="padding:30px;background:linear-gradient(135deg,#228BE6 0%,#1C7ED6 100%);color:#ffffff"><div style="font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;opacity:.86">Millennia Mart</div><h1 style="margin:8px 0 5px;font-size:27px;line-height:1.25">Terima kasih sudah berbelanja!</h1><p style="margin:0;font-size:15px;line-height:1.6;opacity:.92">Transaksi Anda telah berhasil.</p></td></tr><tr><td style="padding:28px 30px 8px"><p style="margin:0 0 18px;font-size:15px;line-height:1.7">Halo <strong>${escapeHtml(greeting)}</strong>, berikut rincian belanja Anda:</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e9ecef;border-radius:12px;overflow:hidden">${itemRows}</table></td></tr><tr><td style="padding:18px 30px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:6px 0;color:#868e96;font-size:14px">Metode pembayaran</td><td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600">${escapeHtml(paymentMethodLabel(input.paymentMethod))}</td></tr><tr><td style="padding:10px 0 4px;color:#343a40;font-size:16px;font-weight:700;border-top:1px solid #e9ecef">Total pembayaran</td><td style="padding:10px 0 4px;text-align:right;color:#1C7ED6;font-size:20px;font-weight:800;border-top:1px solid #e9ecef">${escapeHtml(moneyFormatter.format(input.total))}</td></tr></table></td></tr><tr><td style="padding:0 30px 24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${balanceColors.background};border:1px solid ${balanceColors.border};border-radius:12px"><tr><td style="padding:17px 18px"><div style="font-size:12px;font-weight:700;color:${balanceColors.label};text-transform:uppercase;letter-spacing:.6px">Sisa saldo allowance</div><div style="margin-top:5px;font-size:24px;font-weight:800;color:${balanceColors.value}">${escapeHtml(moneyFormatter.format(input.remainingBalance))}</div></td></tr></table></td></tr><tr><td style="padding:20px 30px;background:#f8f9fa;border-top:1px solid #e9ecef"><p style="margin:0 0 6px;font-size:12px;color:#868e96">${escapeHtml(dateFormatter.format(input.purchasedAt))} · Referensi ${escapeHtml(input.saleId)}</p><p style="margin:0;font-size:13px;color:#495057">Sampai jumpa di Millennia Mart!</p></td></tr></table></td></tr></table></body></html>`;

  return {
    subject: "Terima kasih sudah berbelanja di Millennia Mart",
    text,
    html,
  };
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
        credential: { select: { organizationId: true } },
      },
    });
    if (!sale?.staffEmail) throw new Error("Sale receipt data is incomplete");

    const normalizedEmail = sale.staffEmail.toLowerCase().trim();
    const registeredStaff = await prisma.user.findFirst({
      where: {
        organizationId: sale.credential.organizationId,
        email: normalizedEmail,
        role: "staff",
      },
      select: { id: true, name: true },
    });
    if (!registeredStaff) {
      await prisma.posSale.update({
        where: { id: sale.id },
        data: {
          receiptEmailStatus: "disabled",
          receiptEmailError: "Receipt recipient is not a registered staff user in this organization",
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
    const allowance = await getStaffAllowance(sale.credentialId, normalizedEmail, sale.createdAt);
    await sendEmail({
      to: normalizedEmail,
      ...buildReceiptMessage({
        saleId: sale.id,
        customerName: registeredStaff.name ?? sale.staffName,
        items,
        paymentMethod: sale.paymentMethod,
        total,
        remainingBalance: allowance.remaining,
        purchasedAt: sale.syncedAt ?? sale.createdAt,
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
        { receiptEmailStatus: "processing", receiptEmailAttemptedAt: { lt: staleBefore } },
      ],
    },
    select: { id: true },
    orderBy: [{ receiptEmailAttemptedAt: "asc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(input.limit ?? 50, 1), 100),
  });
  const summary = { attempted: sales.length, sent: 0, failed: 0, disabled: 0, skipped: 0 };
  for (const sale of sales) {
    const result = await sendPosSaleReceipt(sale.id);
    summary[result.status] += 1;
  }
  return summary;
}
