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

  if (input.scenario === "debt") {
    const subject = `Tindakan diperlukan: tagihan allowance ${amount}`;
    const text = [
      `Halo ${greeting},`,
      "",
      `Periode allowance berakhir ${timing}, ${cutoffDate}. Saat ini Anda memiliki tagihan sebesar ${amount}.`,
      "Mohon lunasi tagihan tersebut. Jika pembayaran belum dilakukan sampai periode berakhir, Anda tidak dapat menggunakan allowance untuk transaksi pada periode berikutnya sampai tagihan dilunasi.",
      "",
      "Terima kasih.",
    ].join("\n");
    const html = `<p>Halo ${escapedGreeting},</p><p>Periode allowance berakhir <strong>${timing}, ${escapeHtml(cutoffDate)}</strong>. Saat ini Anda memiliki tagihan sebesar <strong>${escapeHtml(amount)}</strong>.</p><p>Mohon lunasi tagihan tersebut. Jika pembayaran belum dilakukan sampai periode berakhir, Anda tidak dapat menggunakan allowance untuk transaksi pada periode berikutnya sampai tagihan dilunasi.</p><p>Terima kasih.</p>`;
    return { subject, text, html };
  }

  const subject = `Pengingat: sisa allowance ${amount}`;
  const text = [
    `Halo ${greeting},`,
    "",
    `Periode allowance berakhir ${timing}, ${cutoffDate}. Anda masih memiliki sisa allowance sebesar ${amount}.`,
    "Sisa allowance yang tidak digunakan akan hangus dan tidak dibawa ke periode berikutnya.",
    "",
    "Terima kasih.",
  ].join("\n");
  const html = `<p>Halo ${escapedGreeting},</p><p>Periode allowance berakhir <strong>${timing}, ${escapeHtml(cutoffDate)}</strong>. Anda masih memiliki sisa allowance sebesar <strong>${escapeHtml(amount)}</strong>.</p><p>Sisa allowance yang tidak digunakan akan hangus dan tidak dibawa ke periode berikutnya.</p><p>Terima kasih.</p>`;
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
