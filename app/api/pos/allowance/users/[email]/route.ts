import { hasPermission } from "@/lib/access-control";
import { resolveStaff, staffData, staffWhere } from "@/lib/staff-identity";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { z } from "zod";

import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { getOutstandingCurrentAllowanceDebt, getOutstandingPreviousAllowanceDebt, getStaffAllowance } from "@/lib/pos-server";
import { dateOnlySchema, parseDateOnly, startOfDate } from "@/lib/pos";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "allowance.manage")) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const query = z.object({
    credentialId: z.string().uuid(),
    periodStart: dateOnlySchema.optional(),
    periodEnd: dateOnlySchema.optional(),
  }).refine((value) => !!value.periodStart === !!value.periodEnd, {
    message: "periodStart and periodEnd must be provided together",
  }).refine((value) => !value.periodStart || value.periodStart <= value.periodEnd!, {
    message: "periodStart must not be after periodEnd",
  }).safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!query.success) return NextResponse.json({ error: query.error.issues[0]?.message || "Invalid query" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.permissions, query.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  const emailParsed = z.string().email().safeParse(staffEmail);
  if (!emailParsed.success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });
  const requestedPeriod = query.data.periodStart && query.data.periodEnd
    ? { startsAt: parseDateOnly(query.data.periodStart), endsAt: parseDateOnly(query.data.periodEnd) }
    : undefined;
  const staff = await resolveStaff(staffEmail);
  const allowance = await getStaffAllowance(query.data.credentialId, staff.email, new Date(), requestedPeriod);
  const periodStartsAt = startOfDate(new Date(allowance.period.startsAt));
  const periodEndsAt = startOfDate(new Date(allowance.period.endsAt));
  const periodEndExclusive = new Date(periodEndsAt);
  periodEndExclusive.setDate(periodEndExclusive.getDate() + 1);

  const [daysOff, sales, adjustments, debtSettlements, currentDebt, previousDebt, userIdentity, latestSaleIdentity] = await Promise.all([
    prisma.posStaffDayOff.findMany({
      where: { credentialId: query.data.credentialId, AND: [staffWhere(staff)], date: { gte: periodStartsAt, lt: periodEndExclusive } },
      orderBy: { date: "asc" },
    }),
    prisma.posSale.findMany({
      where: {
        credentialId: query.data.credentialId,
        AND: [staffWhere(staff)],
        status: { not: "voided" },
        allowanceUsed: { gt: 0 },
        OR: [
          { allowancePeriodStartsAt: periodStartsAt, allowancePeriodEndsAt: periodEndsAt },
          { allowancePeriodStartsAt: null, createdAt: { gte: periodStartsAt, lt: periodEndExclusive } },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        status: true,
        allowanceUsed: true,
        paymentStrategy: true,
        allowanceBalanceAfter: true,
        payments: { select: { method: true, amount: true }, orderBy: { createdAt: "asc" } },
        items: { select: { itemCode: true, itemName: true, quantity: true, unitPrice: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.posStaffAllowanceAdjustment.findMany({
      where: { credentialId: query.data.credentialId, AND: [staffWhere(staff)] },
      select: { id: true, periodStartsAt: true, periodEndsAt: true, amount: true, note: true, createdAt: true, updatedAt: true, createdBy: { select: { email: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.posStaffAllowanceDebtSettlement.findMany({
      where: {
        credentialId: query.data.credentialId,
        AND: [staffWhere(staff)],
        OR: [{ saleId: null }, { sale: { status: { not: "voided" } } }],
      },
      select: { id: true, periodStartsAt: true, periodEndsAt: true, amount: true, paymentMethod: true, note: true, createdAt: true, createdBy: { select: { email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getOutstandingCurrentAllowanceDebt(query.data.credentialId, staff.email, new Date(), requestedPeriod),
    getOutstandingPreviousAllowanceDebt(query.data.credentialId, staff.email, new Date(), requestedPeriod),
    prisma.user.findFirst({
      where: { organizationId: credential.organizationId, ...(staff.personId ? { centralPersonId: staff.personId } : { email: staff.email }) },
      select: { name: true },
    }),
    prisma.posSale.findFirst({
      where: { credentialId: query.data.credentialId, AND: [staffWhere(staff)], staffName: { not: null } },
      select: { staffName: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    ...allowance,
    staffName: userIdentity?.name ?? latestSaleIdentity?.staffName ?? null,
    daysOff,
    sales,
    adjustments,
    debtSettlements,
    currentDebt,
    previousDebt,
  });
}
