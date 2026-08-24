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
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const [settings, users, salesStaff, reservationStaff] = await Promise.all([
    prisma.posSettings.findUnique({ where: { credentialId } }),
    prisma.user.findMany({
      where: {
        organizationId: credential.organizationId,
        role: { in: ["admin", "staff"] },
      },
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

  const staff = new Map<string, string | null>();
  for (const user of users) staff.set(user.email.toLowerCase(), user.name);
  for (const entry of [...reservationStaff, ...salesStaff]) {
    const email = entry.staffEmail?.toLowerCase().trim();
    if (email && !staff.get(email)) staff.set(email, entry.staffName || null);
  }
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
  const matchingStaff = [...staff.entries()]
    .filter(([email, name]) => !normalizedSearch || email.includes(normalizedSearch) || name?.toLowerCase().includes(normalizedSearch))
    .sort(([emailA], [emailB]) => emailA.localeCompare(emailB));

  if (!matchingStaff.length) return NextResponse.json([]);

  const staffEmails = matchingStaff.map(([staffEmail]) => staffEmail);
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
        staffEmail: { in: staffEmails },
        date: { gte: period.startsAt, lt: periodEndExclusive },
      },
      select: { staffEmail: true, date: true },
    }),
    prisma.posStaffAllowanceAdjustment.findMany({
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        periodStartsAt: period.startsAt,
        periodEndsAt: period.endsAt,
      },
      select: { staffEmail: true, amount: true },
    }),
    prisma.posSale.groupBy({
      by: ["staffEmail"],
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        paymentMethod: "allowance",
        status: { not: "sync_error" },
        createdAt: { gte: period.startsAt, lt: periodEndExclusive },
      },
      _sum: { allowanceUsed: true },
    }),
    prisma.posStaffDayOff.findMany({
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        date: { gte: previousPeriod.startsAt, lt: previousPeriodEndExclusive },
      },
      select: { staffEmail: true, date: true },
    }),
    prisma.posStaffAllowanceAdjustment.findMany({
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        periodStartsAt: previousPeriod.startsAt,
        periodEndsAt: previousPeriod.endsAt,
      },
      select: { staffEmail: true, amount: true },
    }),
    prisma.posSale.groupBy({
      by: ["staffEmail"],
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        paymentMethod: "allowance",
        status: { not: "sync_error" },
        createdAt: { gte: previousPeriod.startsAt, lt: previousPeriodEndExclusive },
      },
      _sum: { allowanceUsed: true },
    }),
    prisma.posStaffAllowanceDebtSettlement.groupBy({
      by: ["staffEmail"],
      where: {
        credentialId,
        staffEmail: { in: staffEmails },
        periodStartsAt: previousPeriod.startsAt,
        periodEndsAt: previousPeriod.endsAt,
      },
      _sum: { amount: true },
    }),
  ]);

  const daysOffByStaff = new Map<string, Date[]>();
  for (const entry of daysOff) {
    const current = daysOffByStaff.get(entry.staffEmail) ?? [];
    current.push(entry.date);
    daysOffByStaff.set(entry.staffEmail, current);
  }
  const adjustmentByStaff = new Map(adjustments.map((entry) => [entry.staffEmail, Number(entry.amount)]));
  const spentMap = new Map(spentByStaff.flatMap((entry) => entry.staffEmail
    ? [[entry.staffEmail, Number(entry._sum.allowanceUsed ?? 0)] as const]
    : []));
  const previousDaysOffByStaff = new Map<string, Date[]>();
  for (const entry of previousDaysOff) {
    const current = previousDaysOffByStaff.get(entry.staffEmail) ?? [];
    current.push(entry.date);
    previousDaysOffByStaff.set(entry.staffEmail, current);
  }
  const previousAdjustmentByStaff = new Map(previousAdjustments.map((entry) => [entry.staffEmail, Number(entry.amount)]));
  const previousSpentMap = new Map(previousSpentByStaff.flatMap((entry) => entry.staffEmail
    ? [[entry.staffEmail, Number(entry._sum.allowanceUsed ?? 0)] as const]
    : []));
  const settlementMap = new Map(settlementsByStaff.map((entry) => [entry.staffEmail, Number(entry._sum.amount ?? 0)]));
  const dailyRate = Number(settings?.allowancePerWorkingDay ?? 0);
  const workingDays = settings?.workingDays ?? [1, 2, 3, 4, 5];
  const holidayDates = settings?.holidayDates ?? [];

  const results = matchingStaff.map(([staffEmail, staffName]) => {
    const breakdown = calculateStaffAllowanceBreakdown(
      dailyRate,
      workingDays,
      period,
      holidayDates,
      daysOffByStaff.get(staffEmail) ?? [],
      adjustmentByStaff.get(staffEmail) ?? 0,
      spentMap.get(staffEmail) ?? 0,
    );
    const previousBreakdown = calculateStaffAllowanceBreakdown(
      dailyRate,
      workingDays,
      previousPeriod,
      holidayDates,
      previousDaysOffByStaff.get(staffEmail) ?? [],
      previousAdjustmentByStaff.get(staffEmail) ?? 0,
      previousSpentMap.get(staffEmail) ?? 0,
    );
    const previousDebt = buildPreviousAllowanceDebt(
      previousBreakdown.remainingAllowance,
      settlementMap.get(staffEmail) ?? 0,
      previousPeriod,
      getStaffPaydayForPeriod(period, settings?.staffPaydayDay ?? 28),
      new Date(),
    );
    return {
      staffEmail,
      staffName,
      ...breakdown,
      total: breakdown.totalAllowance,
      used: breakdown.allowanceSpent,
      remaining: breakdown.remainingAllowance,
      period: { startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), isCustom },
      previousDebt,
    };
  });
  return NextResponse.json(results);
}
