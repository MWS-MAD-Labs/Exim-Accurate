import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { calculateStaffAllowanceBreakdown, dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { buildPreviousAllowanceDebt, getStaffPaydayForPeriod, isAdmin, resolveStaffAllowancePeriod } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  const parsed = z.object({
    credentialId: z.string().uuid(),
    search: z.string().trim().optional(),
    periodStart: dateOnlySchema.optional(),
    periodEnd: dateOnlySchema.optional(),
  }).refine((value) => !!value.periodStart === !!value.periodEnd, {
    message: "periodStart and periodEnd must be provided together",
  }).refine((value) => !value.periodStart || value.periodStart <= value.periodEnd!, {
    message: "periodStart must not be after periodEnd",
  }).safeParse(Object.fromEntries(params));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid query" }, { status: 400 });

  const { credentialId, search, periodStart, periodEnd } = parsed.data;
  const credential = await getOperationalPosCredential(session.user.id, session.user.permissions, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const [settings, users, salesStaff, reservationStaff] = await Promise.all([
    prisma.posSettings.findUnique({ where: { credentialId } }),
    prisma.user.findMany({
      where: {
        organizationId: credential.organizationId,
        permissions: { has: "store.use" },
      },
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

  // A staff member is one person even when the email changed: rows are grouped by the person id,
  // and by email only for people that have no id (guests).
  type Member = { key: string; personId: string | null; email: string; name: string | null };
  const members = new Map<string, Member>();
  const keyByEmail = new Map<string, string>();
  const addMember = (member: Member) => {
    members.set(member.key, member);
    keyByEmail.set(member.email, member.key);
  };
  for (const user of users) {
    const email = user.email.toLowerCase();
    addMember({ key: user.centralPersonId ?? email, personId: user.centralPersonId, email, name: user.name });
  }
  for (const entry of [...reservationStaff, ...salesStaff]) {
    const email = entry.staffEmail?.toLowerCase().trim();
    if (!email) continue;
    const key = entry.staffPersonId ?? keyByEmail.get(email) ?? email;
    const existing = members.get(key);
    if (!existing) addMember({ key, personId: entry.staffPersonId, email, name: entry.staffName || null });
    else if (!existing.name && entry.staffName) existing.name = entry.staffName;
  }
  const rowKey = (row: { staffPersonId: string | null; staffEmail: string | null }) =>
    row.staffPersonId ?? keyByEmail.get(row.staffEmail?.toLowerCase().trim() ?? "") ?? row.staffEmail ?? "";
  const normalizedSearch = search?.toLowerCase();
  const requestedPeriod = periodStart && periodEnd
    ? { startsAt: parseDateOnly(periodStart), endsAt: parseDateOnly(periodEnd) }
    : undefined;
  const { period, isCustom } = await resolveStaffAllowancePeriod(
    credentialId,
    settings?.allowanceCutoffDay ?? 22,
    new Date(),
    requestedPeriod,
  );
  const matchingStaff = [...members.values()]
    .filter((member) => !normalizedSearch || member.email.includes(normalizedSearch) || member.name?.toLowerCase().includes(normalizedSearch))
    .sort((a, b) => a.email.localeCompare(b.email));

  if (!matchingStaff.length) return NextResponse.json([]);

  const staffPersonIds = matchingStaff.flatMap((member) => (member.personId ? [member.personId] : []));
  const staffEmails = matchingStaff.map((member) => member.email);
  // Rows of these people: by person id, and older rows without one by email.
  const staffIn = { OR: [{ staffPersonId: { in: staffPersonIds } }, { staffPersonId: null, staffEmail: { in: staffEmails } }] };
  const periodEndExclusive = new Date(period.endsAt);
  periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);
  const previousPeriodAnchor = new Date(period.startsAt);
  previousPeriodAnchor.setDate(previousPeriodAnchor.getDate() - 1);
  const { period: previousPeriod } = await resolveStaffAllowancePeriod(
    credentialId,
    settings?.allowanceCutoffDay ?? 22,
    previousPeriodAnchor,
  );
  const previousPeriodEndExclusive = new Date(previousPeriod.endsAt);
  previousPeriodEndExclusive.setDate(previousPeriodEndExclusive.getDate() + 1);
  const [daysOff, adjustments, spentByStaff, previousDaysOff, previousAdjustments, previousSpentByStaff, settlementsByStaff] = await Promise.all([
    prisma.posStaffDayOff.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        date: { gte: period.startsAt, lt: periodEndExclusive },
      },
      select: { staffEmail: true, staffPersonId: true, date: true },
    }),
    prisma.posStaffAllowanceAdjustment.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        periodStartsAt: period.startsAt,
        periodEndsAt: period.endsAt,
      },
      select: { staffEmail: true, staffPersonId: true, amount: true },
    }),
    prisma.posSale.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        status: { not: "voided" },
        allowanceUsed: { gt: 0 },
        OR: [
          { allowancePeriodStartsAt: period.startsAt, allowancePeriodEndsAt: period.endsAt },
          { allowancePeriodStartsAt: null, createdAt: { gte: period.startsAt, lt: periodEndExclusive } },
        ],
      },
      select: { allowanceUsed: true, staffEmail: true, staffPersonId: true },
    }),
    prisma.posStaffDayOff.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        date: { gte: previousPeriod.startsAt, lt: previousPeriodEndExclusive },
      },
      select: { staffEmail: true, staffPersonId: true, date: true },
    }),
    prisma.posStaffAllowanceAdjustment.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        periodStartsAt: previousPeriod.startsAt,
        periodEndsAt: previousPeriod.endsAt,
      },
      select: { staffEmail: true, staffPersonId: true, amount: true },
    }),
    prisma.posSale.findMany({
      where: {
        credentialId,
        AND: [staffIn],
        status: { not: "voided" },
        allowanceUsed: { gt: 0 },
        OR: [
          { allowancePeriodStartsAt: previousPeriod.startsAt, allowancePeriodEndsAt: previousPeriod.endsAt },
          { allowancePeriodStartsAt: null, createdAt: { gte: previousPeriod.startsAt, lt: previousPeriodEndExclusive } },
        ],
      },
      select: { allowanceUsed: true, staffEmail: true, staffPersonId: true },
    }),
    prisma.posStaffAllowanceDebtSettlement.groupBy({
      by: ["staffPersonId", "staffEmail", "periodStartsAt", "periodEndsAt"],
      where: {
        credentialId,
        AND: [
          staffIn,
          {
            OR: [
              { periodStartsAt: period.startsAt, periodEndsAt: period.endsAt },
              { periodStartsAt: previousPeriod.startsAt, periodEndsAt: previousPeriod.endsAt },
            ],
          },
          { OR: [{ saleId: null }, { sale: { status: { not: "voided" } } }] },
        ],
      },
      _sum: { amount: true },
    }),
  ]);

  const daysOffByStaff = new Map<string, Date[]>();
  for (const entry of daysOff) {
    const current = daysOffByStaff.get(rowKey(entry)) ?? [];
    current.push(entry.date);
    daysOffByStaff.set(rowKey(entry), current);
  }
  const adjustmentByStaff = new Map(adjustments.map((entry) => [rowKey(entry), Number(entry.amount)]));
  const spentMap = new Map<string, number>();
  for (const entry of spentByStaff) {
    spentMap.set(rowKey(entry), (spentMap.get(rowKey(entry)) ?? 0) + Number(entry.allowanceUsed));
  }
  const previousDaysOffByStaff = new Map<string, Date[]>();
  for (const entry of previousDaysOff) {
    const current = previousDaysOffByStaff.get(rowKey(entry)) ?? [];
    current.push(entry.date);
    previousDaysOffByStaff.set(rowKey(entry), current);
  }
  const previousAdjustmentByStaff = new Map(previousAdjustments.map((entry) => [rowKey(entry), Number(entry.amount)]));
  const previousSpentMap = new Map<string, number>();
  for (const entry of previousSpentByStaff) {
    previousSpentMap.set(rowKey(entry), (previousSpentMap.get(rowKey(entry)) ?? 0) + Number(entry.allowanceUsed));
  }
  const settlementMap = new Map(settlementsByStaff.map((entry) => [
    `${rowKey(entry)}:${entry.periodStartsAt.toISOString()}:${entry.periodEndsAt.toISOString()}`,
    Number(entry._sum.amount ?? 0),
  ]));
  const settlementAmount = (staffKey: string, debtPeriod: { startsAt: Date; endsAt: Date }) => settlementMap.get(
    `${staffKey}:${debtPeriod.startsAt.toISOString()}:${debtPeriod.endsAt.toISOString()}`,
  ) ?? 0;
  const dailyRate = Number(settings?.allowancePerWorkingDay ?? 0);
  const workingDays = settings?.workingDays ?? [1, 2, 3, 4, 5];
  const holidayDates = settings?.holidayDates ?? [];

  const results = matchingStaff.map(({ key: staffKey, email: staffEmail, name: staffName, personId }) => {
    const breakdown = calculateStaffAllowanceBreakdown(
      dailyRate,
      workingDays,
      period,
      holidayDates,
      daysOffByStaff.get(staffKey) ?? [],
      adjustmentByStaff.get(staffKey) ?? 0,
      spentMap.get(staffKey) ?? 0,
    );
    const previousBreakdown = calculateStaffAllowanceBreakdown(
      dailyRate,
      workingDays,
      previousPeriod,
      holidayDates,
      previousDaysOffByStaff.get(staffKey) ?? [],
      previousAdjustmentByStaff.get(staffKey) ?? 0,
      previousSpentMap.get(staffKey) ?? 0,
    );
    const currentDebt = buildPreviousAllowanceDebt(
      breakdown.remainingAllowance,
      settlementAmount(staffKey, period),
      period,
      null,
      new Date(),
    );
    const previousDebt = buildPreviousAllowanceDebt(
      previousBreakdown.remainingAllowance,
      settlementAmount(staffKey, previousPeriod),
      previousPeriod,
      getStaffPaydayForPeriod(period, settings?.staffPaydayDay ?? 28),
      new Date(),
    );
    return {
      staffEmail,
      staffPersonId: personId,
      staffName,
      ...breakdown,
      total: breakdown.totalAllowance,
      used: breakdown.allowanceSpent,
      remaining: breakdown.remainingAllowance,
      period: { startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), isCustom },
      currentDebt,
      previousDebt,
    };
  });
  return NextResponse.json(results);
}
