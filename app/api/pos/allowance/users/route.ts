import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";

import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { calculateStaffAllowanceBreakdown, dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { isAdmin, resolveStaffAllowancePeriod } from "@/lib/pos-server";

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
      where: { organizationId: credential.organizationId, role: "staff" },
      select: { email: true },
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
  for (const user of users) staff.set(user.email.toLowerCase(), null);
  for (const entry of [...reservationStaff, ...salesStaff]) {
    const email = entry.staffEmail?.toLowerCase().trim();
    if (email) staff.set(email, entry.staffName || staff.get(email) || null);
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
  const [daysOff, adjustments, spentByStaff] = await Promise.all([
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
  const dailyRate = Number(settings?.allowancePerWorkingDay ?? 0);
  const workingDays = settings?.workingDays ?? [1, 2, 3, 4, 5];
  const holidayDates = settings?.holidayDates ?? [];

  return NextResponse.json(matchingStaff.map(([staffEmail, staffName]) => {
    const breakdown = calculateStaffAllowanceBreakdown(
      dailyRate,
      workingDays,
      period,
      holidayDates,
      daysOffByStaff.get(staffEmail) ?? [],
      adjustmentByStaff.get(staffEmail) ?? 0,
      spentMap.get(staffEmail) ?? 0,
    );
    return {
      staffEmail,
      staffName,
      ...breakdown,
      total: breakdown.totalAllowance,
      used: breakdown.allowanceSpent,
      remaining: breakdown.remainingAllowance,
      period: { startsAt: period.startsAt.toISOString(), endsAt: period.endsAt.toISOString(), isCustom },
    };
  }));
}
