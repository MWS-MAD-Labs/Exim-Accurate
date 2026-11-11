import { Prisma } from "@prisma/client";
import { sadeLogoImg, sadeWordmark, sendEmail } from "@/lib/email";
import { startOfDate, toDateOnlyValue } from "@/lib/pos";
import {
  getOutstandingCurrentAllowanceDebt,
  getStaffAllowance,
  resolveStaffAllowancePeriod,
} from "@/lib/pos-server";
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

export function classifyAllowanceNotification(
  remaining: number,
  outstandingDebt: number,
) {
  if (outstandingDebt > 0.005)
    return { scenario: "debt" as const, amount: outstandingDebt };
  if (remaining > 0.005)
    return { scenario: "remaining_balance" as const, amount: remaining };
  return null;
}
type NotificationRecipient = {
  email: string;
  name: string | null;
  personId: string | null;
};
type ClaimResult =
  | { status: "claimed"; notificationId: string }
  | { status: "already_notified" }
  | { status: "locked" };

function calendarDayNumber(value: Date) {
  return (
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) /
    86_400_000
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character]!,
  );
}

// Ganti fungsi buildNotificationMessage yang lama dengan ini.
// Pakai ulang: currencyFormatter, dateFormatter, escapeHtml, NotificationScenario (sudah ada di file).
export function buildNotificationMessage(input: {
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
  const timingLabel = input.reminderDay === 1 ? "Besok" : "Hari ini";
  const escapedGreeting = escapeHtml(greeting);
  const escapedEmail = escapeHtml(input.email);
  const escapedAmount = escapeHtml(amount);
  const escapedCutoffDate = escapeHtml(cutoffDate);
  const isDebt = input.scenario === "debt";
  const subject = isDebt
    ? `Tindakan diperlukan: tagihan allowance ${amount}`
    : `Pengingat: sisa allowance ${amount}`;
  const title = isDebt
    ? "Tagihan allowance perlu diselesaikan"
    : "Allowance Anda masih tersedia";
  const amountLabel = isDebt ? "Jumlah tagihan" : "Sisa allowance";
  const statusLabel = isDebt ? "Tagihan" : "Sisa allowance";
  const summary = isDebt
    ? `Saat ini Anda memiliki tagihan allowance sebesar ${amount}.`
    : `Anda masih memiliki sisa allowance sebesar ${amount}.`;
  const action = isDebt
    ? "Mohon lunasi tagihan tersebut. Jika pembayaran belum dilakukan sampai periode berakhir, Anda tidak dapat menggunakan allowance untuk transaksi pada periode berikutnya sampai tagihan dilunasi."
    : "Sisa allowance yang tidak digunakan akan hangus dan tidak dibawa ke periode berikutnya.";

  // SAFESpace alerts: soft rose for an overdue balance, soft sky for information.
  const accentColor = isDebt ? "#AD4E4E" : "#4C7E95";
  const alertBackground = isDebt ? "#FFF1F1" : "#EFF7FA";
  const alertBorder = isDebt ? "#F2B8B8" : "#C5E1EA";
  const alertTitle = isDebt ? "Tindakan diperlukan" : "Perlu diketahui";
  const preheader = isDebt
    ? `Tagihan allowance ${amount} perlu dibayar sebelum periode berikutnya.`
    : `Sisa allowance ${amount} akan berakhir ${timing}.`;

  // Tombol hanya tampil kalau URL aplikasi diset (sesuaikan nama env-nya).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const buttonLabel = isDebt ? "Lihat tagihan" : "Buka Sade";

  const headingFont = "'Plus Jakarta Sans','Nunito Sans',Arial,sans-serif";
  const bodyFont =
    "'Nunito Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const logoHtml = sadeLogoImg();
  const year = new Date().getFullYear();

  const divider = `<tr><td colspan="2" style="padding:14px 0;"><div style="height:1px;line-height:1px;font-size:1px;background-color:#D9E2D4;">&nbsp;</div></td></tr>`;
  const dashedDivider = `<tr><td colspan="2" style="padding:12px 0;"><div style="height:0;line-height:0;font-size:0;border-top:1px dashed #C9D3C3;">&nbsp;</div></td></tr>`;
  const rowTitle = isDebt ? "Tagihan allowance" : "Sisa allowance";
  const rowSub = isDebt ? "Belum dilunasi" : "Belum digunakan";
  const totalLabel = isDebt ? "Total Tagihan" : "Total Sisa";

  const button = appUrl
    ? `<tr>
                  <td colspan="2" style="padding-top:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#486142" style="border-radius:10px;background-color:#486142;">
                          <a href="${escapeHtml(appUrl)}" style="display:block;padding:14px 20px;color:#FFFAF4;font-family:${headingFont};font-size:14px;font-weight:700;line-height:1.2;text-decoration:none;">${buttonLabel}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>`
    : "";

  const text = [
    `Halo ${greeting},`,
    "",
    `Periode allowance berakhir ${timing}, ${cutoffDate}. ${summary}`,
    action,
    "",
    "Terima kasih,",
    "Tim Sade",
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
<body style="margin:0;padding:0;background-color:#FFFFFF;color:#211F1A;font-family:${bodyFont};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
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
              <h1 style="margin:0 0 14px;color:#211F1A;font-family:${headingFont};font-size:20px;font-weight:800;line-height:1.35;">${title}</h1>
              <p style="margin:0 0 4px;color:#211F1A;font-size:14px;font-weight:800;line-height:1.6;">Halo ${escapedGreeting},</p>
              <p style="margin:0 0 20px;color:#635F57;font-size:13px;line-height:1.7;">Periode allowance Anda berakhir <strong style="color:#211F1A;">${timing}, ${escapedCutoffDate}</strong>. ${escapeHtml(summary)}</p>

              <!-- Kartu detail -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;background-color:#F2F5EF;border:1px solid #DDE5D8;border-radius:14px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        <td style="padding:6px 0;color:#7C776E;font-size:12px;font-weight:700;">Status</td>
                        <td align="right" style="padding:6px 0;"><span style="display:inline-block;padding:5px 10px;border-radius:6px;background-color:${alertBackground};border:1px solid ${alertBorder};color:${accentColor};font-size:11px;font-weight:800;line-height:1;letter-spacing:0.4px;text-transform:uppercase;">${statusLabel}</span></td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;color:#7C776E;font-size:12px;font-weight:700;">Penerima</td>
                        <td align="right" style="padding:6px 0;color:#211F1A;font-size:12px;font-weight:800;"><a href="mailto:${escapedEmail}" style="color:#211F1A;text-decoration:none;">${escapedEmail}</a></td>
                      </tr>
                      ${divider}
                      <tr>
                        <td colspan="2" align="center" style="padding:6px 0;color:#211F1A;font-family:${headingFont};font-size:15px;font-weight:800;line-height:1.5;">Periode allowance berakhir ${timing}</td>
                      </tr>
                      ${divider}
                      <tr>
                        <td colspan="2">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td width="60%" valign="top" style="padding-right:8px;">
                                <div style="margin-bottom:4px;color:#7C776E;font-size:12px;font-weight:700;">Tanggal berakhir</div>
                                <div style="color:#211F1A;font-size:12px;font-weight:800;">${escapedCutoffDate}</div>
                              </td>
                              <td width="40%" valign="top">
                                <div style="margin-bottom:4px;color:#7C776E;font-size:12px;font-weight:700;">Pengingat</div>
                                <div style="color:#211F1A;font-size:12px;font-weight:800;">${timingLabel}</div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${button}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Kartu rincian -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:separate;background-color:#FFFFFF;border:1px solid #D9E2D4;border-radius:14px;">
                <tr>
                  <td style="padding:20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">
                      <tr>
                        <td style="padding:0 0 6px;color:#7C776E;font-size:11px;font-weight:700;">Rincian</td>
                        <td align="right" style="padding:0 0 6px;color:#7C776E;font-size:11px;font-weight:700;">Jumlah</td>
                      </tr>
                      <tr>
                        <td valign="top" style="padding:8px 12px 8px 0;">
                          <div style="color:#211F1A;font-size:12px;font-weight:800;line-height:1.5;">${rowTitle}</div>
                          <div style="color:#7C776E;font-size:12px;line-height:1.5;">${rowSub}</div>
                        </td>
                        <td align="right" valign="top" style="padding:8px 0;color:#211F1A;font-size:12px;font-weight:800;white-space:nowrap;">${escapedAmount}</td>
                      </tr>
                      ${dashedDivider}
                      <tr>
                        <td style="padding:5px 0;color:#7C776E;font-size:12px;font-weight:700;">Batas periode</td>
                        <td align="right" style="padding:5px 0;color:#211F1A;font-size:12px;font-weight:800;">${escapedCutoffDate}</td>
                      </tr>
                      ${divider}
                      <tr>
                        <td style="color:#211F1A;font-family:${headingFont};font-size:14px;font-weight:800;">${totalLabel}</td>
                        <td align="right" style="color:${accentColor};font-family:${headingFont};font-size:18px;font-weight:800;white-space:nowrap;">${escapedAmount}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Catatan -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:16px;border-collapse:separate;background-color:${alertBackground};border:1px solid ${alertBorder};border-radius:14px;">
                <tr>
                  <td width="5" style="width:5px;background-color:${accentColor};border-radius:14px 0 0 14px;"></td>
                  <td style="padding:18px 20px 18px 16px;">
                    <div style="margin-bottom:6px;color:${accentColor};font-size:13px;font-weight:800;line-height:1.3;">${alertTitle}</div>
                    <div style="color:#34322D;font-size:13px;line-height:1.65;">${escapeHtml(action)}</div>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 20px;color:#635F57;font-size:13px;line-height:1.7;">Terima kasih,<br><strong style="color:#211F1A;">Tim Sade</strong></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px;background-color:#486142;">
              <p style="margin:0 0 14px;color:#E6EBE2;font-size:11px;line-height:1.6;">Email ini dikirim otomatis oleh sistem Sade berdasarkan saldo allowance Anda.</p>
              <div style="height:1px;line-height:1px;font-size:1px;background-color:#6F8B6A;">&nbsp;</div>
              <p style="margin:14px 0 0;color:#E6EBE2;font-size:11px;line-height:1.6;">&copy; ${year} Sade &middot; Millennia Mart and Resources</p>
            </td>
          </tr>
        </table>
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
  staffPersonId: string | null;
  periodStartsAt: Date;
  periodEndsAt: Date;
  reminderDay: 0 | 1;
  scenario: NotificationScenario;
  amount: number;
}) {
  // One reminder per person and period, even when the email changed in between.
  const key = input.staffPersonId
    ? {
        credentialId_staffPersonId_periodStartsAt_periodEndsAt_reminderDay: {
          credentialId: input.credentialId,
          staffPersonId: input.staffPersonId,
          periodStartsAt: input.periodStartsAt,
          periodEndsAt: input.periodEndsAt,
          reminderDay: input.reminderDay,
        },
      }
    : {
        credentialId_staffEmail_periodStartsAt_periodEndsAt_reminderDay: {
          credentialId: input.credentialId,
          staffEmail: input.staffEmail,
          periodStartsAt: input.periodStartsAt,
          periodEndsAt: input.periodEndsAt,
          reminderDay: input.reminderDay,
        },
      };
  const existing = await prisma.posAllowanceNotification.findUnique({
    where: key,
  });
  if (!existing) {
    try {
      const notification = await prisma.posAllowanceNotification.create({
        data: { ...input, status: "processing" },
      });
      return {
        status: "claimed",
        notificationId: notification.id,
      } satisfies ClaimResult;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { status: "locked" } satisfies ClaimResult;
      }
      throw error;
    }
  }
  if (existing.status === "sent")
    return { status: "already_notified" } satisfies ClaimResult;
  if (
    existing.status === "processing" &&
    existing.updatedAt.getTime() > Date.now() - RETRY_AFTER_MS
  ) {
    return { status: "locked" } satisfies ClaimResult;
  }

  const claimed = await prisma.posAllowanceNotification.updateMany({
    where: {
      id: existing.id,
      status: existing.status,
      updatedAt: existing.updatedAt,
    },
    data: {
      scenario: input.scenario,
      amount: input.amount,
      status: "processing",
      errorMessage: null,
    },
  });
  return claimed.count === 1
    ? { status: "claimed", notificationId: existing.id }
    : { status: "locked" };
}

async function getNotificationRecipients(
  credentialId: string,
  organizationId: string,
) {
  const [users, salesStaff, reservationStaff] = await Promise.all([
    prisma.user.findMany({
      where: { organizationId, permissions: { has: "store.use" } },
      select: { email: true, name: true, centralPersonId: true },
    }),
    prisma.posSale.findMany({
      where: { credentialId, staffEmail: { not: null } },
      distinct: ["staffPersonId", "staffEmail"],
      select: { staffEmail: true, staffName: true, staffPersonId: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.posReservation.findMany({
      where: { credentialId },
      distinct: ["staffPersonId", "staffEmail"],
      select: { staffEmail: true, staffName: true, staffPersonId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // One recipient per person, at the email the person has now. An email a person used before
  // only counts for people without an id (guests).
  const recipients = new Map<string, NotificationRecipient>();
  const knownPeople = new Set<string>();
  for (const user of users) {
    const email = user.email.toLowerCase().trim();
    recipients.set(email, {
      email,
      name: user.name,
      personId: user.centralPersonId,
    });
    if (user.centralPersonId) knownPeople.add(user.centralPersonId);
  }
  const previousEmails = new Set(
    (await prisma.userEmailHistory.findMany({ select: { email: true } })).map(
      (row) => row.email,
    ),
  );
  for (const entry of [...reservationStaff, ...salesStaff]) {
    const email = entry.staffEmail?.toLowerCase().trim();
    if (!email) continue;
    if (entry.staffPersonId && knownPeople.has(entry.staffPersonId)) {
      // Same person as a user above; only the name may be missing.
      continue;
    }
    if (previousEmails.has(email)) continue;
    const existing = recipients.get(email);
    if (!existing)
      recipients.set(email, {
        email,
        name: entry.staffName || null,
        personId: entry.staffPersonId,
      });
    else if (!existing.name && entry.staffName)
      recipients.set(email, { ...existing, name: entry.staffName });
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
      const { period } = await resolveStaffAllowancePeriod(
        setting.credentialId,
        setting.allowanceCutoffDay,
        today,
      );
      const daysUntilCutoff =
        calendarDayNumber(period.endsAt) - calendarDayNumber(today);
      if (daysUntilCutoff !== 0 && daysUntilCutoff !== 1) continue;
      summary.storesDue += 1;
      const reminderDay = daysUntilCutoff as 0 | 1;
      const recipients = await getNotificationRecipients(
        setting.credentialId,
        setting.organizationId,
      );

      for (const recipient of recipients) {
        try {
          const [allowance, debt] = await Promise.all([
            getStaffAllowance(
              setting.credentialId,
              recipient.email,
              today,
              period,
            ),
            getOutstandingCurrentAllowanceDebt(
              setting.credentialId,
              recipient.email,
              today,
              period,
            ),
          ]);
          const notification = classifyAllowanceNotification(
            allowance.remaining,
            debt.outstanding,
          );
          if (!notification) {
            summary.zeroBalance += 1;
            continue;
          }
          summary.eligible += 1;
          const { scenario, amount } = notification;
          const claim = await claimNotification({
            credentialId: setting.credentialId,
            staffEmail: recipient.email,
            staffPersonId: recipient.personId,
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
            const errorMessage =
              error instanceof Error
                ? error.message
                : "Unknown email delivery error";
            summary.failed += 1;
            console.error(
              `[pos-allowance-notifications] Delivery failed for ${recipient.email}`,
              error,
            );
            try {
              await prisma.posAllowanceNotification.update({
                where: { id: claim.notificationId },
                data: {
                  status: "failed",
                  errorMessage: errorMessage.slice(0, 2000),
                },
              });
            } catch (persistenceError) {
              console.error(
                `[pos-allowance-notifications] Could not persist delivery failure for ${recipient.email}`,
                persistenceError,
              );
            }
          }
        } catch (error) {
          summary.failed += 1;
          console.error(
            `[pos-allowance-notifications] Recipient processing failed for ${recipient.email}`,
            error,
          );
        }
      }
    } catch (error) {
      summary.storesFailed += 1;
      console.error(
        `[pos-allowance-notifications] Store processing failed for ${setting.credentialId}`,
        error,
      );
    }
  }

  return { date: toDateOnlyValue(today), ...summary };
}
