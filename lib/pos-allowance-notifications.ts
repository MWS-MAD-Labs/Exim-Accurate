import { Prisma } from "@prisma/client";
import { sendEmail } from "@/lib/email";
import { startOfDate, toDateOnlyValue } from "@/lib/pos";
import { getStaffAllowance, resolveStaffAllowancePeriod } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const RETRY_AFTER_MS = 15 * 60 * 1000;
const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

type NotificationScenario = "debt" | "remaining_balance";
type NotificationRecipient = { email: string; name: string | null };
type ClaimResult =
  | { status: "claimed"; notificationId: string }
  | { status: "already_notified" }
  | { status: "locked" };

function calendarDayNumber(value: Date) {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function buildNotificationMessage(input: {
  name: string | null;
  email: string;
  amount: number;
  cutoffDate: Date;
  reminderDay: 0 | 1;
  scenario: NotificationScenario;
}) {
  const greeting = input.name?.trim() || input.email;
  const amount = currencyFormatter.format(input.amount);
  const cutoffDate = dateFormatter.format(input.cutoffDate);
  const timing = input.reminderDay === 1 ? "besok" : "hari ini";
  const escapedGreeting = escapeHtml(greeting);
  const escapedAmount = escapeHtml(amount);
  const escapedCutoffDate = escapeHtml(cutoffDate);
  const isDebt = input.scenario === "debt";
  const subject = isDebt
    ? `Tindakan diperlukan: tagihan allowance ${amount}`
    : `Pengingat: sisa allowance ${amount}`;
  const title = isDebt ? "Tagihan allowance perlu diselesaikan" : "Allowance Anda masih tersedia";
  const amountLabel = isDebt ? "Jumlah tagihan" : "Sisa allowance";
  const summary = isDebt
    ? `Saat ini Anda memiliki tagihan allowance sebesar ${amount}.`
    : `Anda masih memiliki sisa allowance sebesar ${amount}.`;
  const action = isDebt
    ? "Mohon lunasi tagihan tersebut. Jika pembayaran belum dilakukan sampai periode berakhir, Anda tidak dapat menggunakan allowance untuk transaksi pada periode berikutnya sampai tagihan dilunasi."
    : "Sisa allowance yang tidak digunakan akan hangus dan tidak dibawa ke periode berikutnya.";
  const accentColor = isDebt ? "#F76707" : "#228BE6";
  const alertBackground = isDebt ? "#FFF4E6" : "#E7F5FF";
  const alertBorder = isDebt ? "#FFD8A8" : "#A5D8FF";
  const alertTitle = isDebt ? "Tindakan diperlukan" : "Perlu diketahui";
  const preheader = isDebt
    ? `Tagihan allowance ${amount} perlu dibayar sebelum periode berikutnya.`
    : `Sisa allowance ${amount} akan berakhir ${timing}.`;

  const text = [
    `Halo ${greeting},`,
    "",
    `Periode allowance berakhir ${timing}, ${cutoffDate}. ${summary}`,
    action,
    "",
    "Terima kasih.",
  ].join("\n");

  const html = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F7FB;color:#212529;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#F4F7FB;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#FFFFFF;border:1px solid #E9ECEF;border-radius:16px;box-shadow:0 10px 30px rgba(33,37,41,0.08);overflow:hidden;">
          <tr>
            <td style="padding:28px 32px;background-color:#228BE6;background-image:linear-gradient(135deg,#228BE6 0%,#1C7ED6 100%);">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;border-radius:12px;background-color:rgba(255,255,255,0.2);color:#FFFFFF;font-size:24px;font-weight:800;line-height:48px;">E</td>
                  <td style="padding-left:14px;color:#FFFFFF;">
                    <div style="font-size:22px;font-weight:800;line-height:1.2;letter-spacing:-0.4px;">Exima</div>
                    <div style="padding-top:4px;font-size:13px;line-height:1.4;color:#D0EBFF;">POS Allowance Notification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <div style="display:inline-block;padding:7px 12px;border-radius:999px;background-color:${alertBackground};color:${accentColor};font-size:12px;font-weight:700;line-height:1;letter-spacing:0.3px;text-transform:uppercase;">Cutoff ${timing}</div>
              <h1 style="margin:18px 0 12px;color:#212529;font-size:26px;font-weight:800;line-height:1.3;letter-spacing:-0.5px;">${title}</h1>
              <p style="margin:0 0 24px;color:#495057;font-size:16px;line-height:1.7;">Halo <strong style="color:#212529;">${escapedGreeting}</strong>, periode allowance Anda berakhir <strong style="color:#212529;">${timing}, ${escapedCutoffDate}</strong>.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 24px;border-collapse:separate;background-color:#F8F9FA;border:1px solid #E9ECEF;border-radius:12px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <div style="margin-bottom:7px;color:#868E96;font-size:13px;font-weight:600;line-height:1.3;text-transform:uppercase;letter-spacing:0.5px;">${amountLabel}</div>
                    <div style="color:${accentColor};font-size:32px;font-weight:800;line-height:1.2;letter-spacing:-0.8px;">${escapedAmount}</div>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;background-color:${alertBackground};border:1px solid ${alertBorder};border-radius:12px;">
                <tr>
                  <td width="5" style="width:5px;background-color:${accentColor};border-radius:12px 0 0 12px;"></td>
                  <td style="padding:20px 20px 20px 18px;">
                    <div style="margin-bottom:7px;color:${accentColor};font-size:14px;font-weight:800;line-height:1.3;">${alertTitle}</div>
                    <div style="color:#343A40;font-size:15px;line-height:1.65;">${escapeHtml(action)}</div>
                  </td>
                </tr>
              </table>

              <p style="margin:28px 0 0;color:#495057;font-size:15px;line-height:1.7;">Terima kasih,<br><strong style="color:#212529;">Tim Exima</strong></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#F8F9FA;border-top:1px solid #E9ECEF;text-align:center;">
              <p style="margin:0;color:#868E96;font-size:12px;line-height:1.6;">Email ini dikirim otomatis oleh sistem Exima berdasarkan saldo allowance Anda.</p>
            </td>
          </tr>
        </table>
        <p style="margin:18px 0 0;color:#ADB5BD;font-size:11px;line-height:1.5;">Exima · Accurate Online Operations</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

async function claimNotification(input: {
  credentialId: string;
  staffEmail: string;
  periodStartsAt: Date;
  periodEndsAt: Date;
  reminderDay: 0 | 1;
  scenario: NotificationScenario;
  amount: number;
}) {
  const key = {
    credentialId_staffEmail_periodStartsAt_periodEndsAt_reminderDay: {
      credentialId: input.credentialId,
      staffEmail: input.staffEmail,
      periodStartsAt: input.periodStartsAt,
      periodEndsAt: input.periodEndsAt,
      reminderDay: input.reminderDay,
    },
  };
  const existing = await prisma.posAllowanceNotification.findUnique({ where: key });
  if (!existing) {
    try {
      const notification = await prisma.posAllowanceNotification.create({ data: { ...input, status: "processing" } });
      return { status: "claimed", notificationId: notification.id } satisfies ClaimResult;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { status: "locked" } satisfies ClaimResult;
      }
      throw error;
    }
  }
  if (existing.status === "sent") return { status: "already_notified" } satisfies ClaimResult;
  if (existing.status === "processing" && existing.updatedAt.getTime() > Date.now() - RETRY_AFTER_MS) {
    return { status: "locked" } satisfies ClaimResult;
  }

  const claimed = await prisma.posAllowanceNotification.updateMany({
    where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
    data: { scenario: input.scenario, amount: input.amount, status: "processing", errorMessage: null },
  });
  return claimed.count === 1
    ? { status: "claimed", notificationId: existing.id }
    : { status: "locked" };
}

async function getNotificationRecipients(credentialId: string, organizationId: string) {
  const [users, salesStaff, reservationStaff] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, role: { in: ["admin", "staff"] } },
      select: { email: true, name: true },
    }),
    prisma.posSale.findMany({
      where: { credentialId, staffEmail: { not: null } },
      distinct: ["staffEmail"],
      select: { staffEmail: true, staffName: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.posReservation.findMany({
      where: { credentialId },
      distinct: ["staffEmail"],
      select: { staffEmail: true, staffName: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const recipients = new Map<string, NotificationRecipient>();
  for (const user of users) {
    const email = user.email.toLowerCase().trim();
    recipients.set(email, { email, name: user.name });
  }
  for (const entry of [...reservationStaff, ...salesStaff]) {
    const email = entry.staffEmail?.toLowerCase().trim();
    if (!email) continue;
    const existing = recipients.get(email);
    if (!existing) recipients.set(email, { email, name: entry.staffName || null });
    else if (!existing.name && entry.staffName) recipients.set(email, { email, name: entry.staffName });
  }
  return [...recipients.values()];
}

export async function sendPosAllowanceCutoffNotifications(now = new Date()) {
  const today = startOfDate(now);
  const settings = await prisma.posSettings.findMany({
    where: { isActive: true, credential: { disconnectedAt: null } },
    select: {
      credentialId: true,
      allowanceCutoffDay: true,
      organizationId: true,
    },
  });
  const summary = {
    storesChecked: settings.length,
    storesDue: 0,
    storesFailed: 0,
    eligible: 0,
    zeroBalance: 0,
    alreadyNotified: 0,
    locked: 0,
    sent: 0,
    failed: 0,
  };

  for (const setting of settings) {
    try {
      const { period } = await resolveStaffAllowancePeriod(setting.credentialId, setting.allowanceCutoffDay, today);
      const daysUntilCutoff = calendarDayNumber(period.endsAt) - calendarDayNumber(today);
      if (daysUntilCutoff !== 0 && daysUntilCutoff !== 1) continue;
      summary.storesDue += 1;
      const reminderDay = daysUntilCutoff as 0 | 1;
      const recipients = await getNotificationRecipients(setting.credentialId, setting.organizationId);

      for (const recipient of recipients) {
        try {
          const allowance = await getStaffAllowance(setting.credentialId, recipient.email, today, period);
          if (Math.abs(allowance.remaining) < 0.005) {
            summary.zeroBalance += 1;
            continue;
          }
          summary.eligible += 1;
          const scenario: NotificationScenario = allowance.remaining < 0 ? "debt" : "remaining_balance";
          const amount = Math.abs(allowance.remaining);
          const claim = await claimNotification({
            credentialId: setting.credentialId,
            staffEmail: recipient.email,
            periodStartsAt: period.startsAt,
            periodEndsAt: period.endsAt,
            reminderDay,
            scenario,
            amount,
          });
          if (claim.status === "already_notified") {
            summary.alreadyNotified += 1;
            continue;
          }
          if (claim.status === "locked") {
            summary.locked += 1;
            continue;
          }

          try {
            await sendEmail({
              to: recipient.email,
              ...buildNotificationMessage({
                name: recipient.name,
                email: recipient.email,
                amount,
                cutoffDate: period.endsAt,
                reminderDay,
                scenario,
              }),
            });
            await prisma.posAllowanceNotification.update({
              where: { id: claim.notificationId },
              data: { status: "sent", sentAt: new Date(), errorMessage: null },
            });
            summary.sent += 1;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown email delivery error";
            summary.failed += 1;
            console.error(`[pos-allowance-notifications] Delivery failed for ${recipient.email}`, error);
            try {
              await prisma.posAllowanceNotification.update({
                where: { id: claim.notificationId },
                data: { status: "failed", errorMessage: errorMessage.slice(0, 2000) },
              });
            } catch (persistenceError) {
              console.error(`[pos-allowance-notifications] Could not persist delivery failure for ${recipient.email}`, persistenceError);
            }
          }
        } catch (error) {
          summary.failed += 1;
          console.error(`[pos-allowance-notifications] Recipient processing failed for ${recipient.email}`, error);
        }
      }
    } catch (error) {
      summary.storesFailed += 1;
      console.error(`[pos-allowance-notifications] Store processing failed for ${setting.credentialId}`, error);
    }
  }

  return { date: toDateOnlyValue(today), ...summary };
}
