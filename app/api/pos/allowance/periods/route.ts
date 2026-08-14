import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { getRecurringAllowancePeriod, startOfDate, toDateOnlyValue } from "@/lib/pos";
import { isAdmin, resolveStaffAllowancePeriod } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = z.object({
    credentialId: z.string().uuid(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  }).safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

  const { credentialId, year: requestedYear } = parsed.data;
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const settings = await prisma.posSettings.findUnique({
    where: { credentialId },
    select: { allowanceCutoffDay: true },
  });
  const cutoffDay = settings?.allowanceCutoffDay ?? 22;
  const today = startOfDate(new Date());
  const { period: ongoingPeriod } = await resolveStaffAllowancePeriod(credentialId, cutoffDay, today);
  const year = requestedYear ?? ongoingPeriod.endsAt.getFullYear();
  const overrides = await prisma.posAllowancePeriodOverride.findMany({
    where: {
      credentialId,
      endsAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      startsAt: { lte: today },
    },
    select: { startsAt: true, endsAt: true },
  });

  const customPeriods = overrides.map((period) => ({
    startsAt: startOfDate(period.startsAt),
    endsAt: startOfDate(period.endsAt),
  }));
  const periods = Array.from({ length: 12 }, (_, month) =>
    getRecurringAllowancePeriod(cutoffDay, new Date(year, month, cutoffDay)),
  ).filter((period) => period.endsAt.getFullYear() === year && period.startsAt <= today);

  const options = new Map<string, { startsAt: Date; endsAt: Date; isCustom: boolean }>();
  for (const period of periods) {
    options.set(`${toDateOnlyValue(period.startsAt)}:${toDateOnlyValue(period.endsAt)}`, {
      ...period,
      isCustom: false,
    });
  }
  for (const period of customPeriods) {
    options.set(`${toDateOnlyValue(period.startsAt)}:${toDateOnlyValue(period.endsAt)}`, {
      ...period,
      isCustom: true,
    });
  }

  return NextResponse.json({
    year,
    cutoffDay,
    periods: [...options.values()]
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
      .map((period) => ({
        startsAt: toDateOnlyValue(period.startsAt),
        endsAt: toDateOnlyValue(period.endsAt),
        isCustom: period.isCustom,
        isOngoing:
          toDateOnlyValue(period.startsAt) === toDateOnlyValue(ongoingPeriod.startsAt) &&
          toDateOnlyValue(period.endsAt) === toDateOnlyValue(ongoingPeriod.endsAt),
      })),
  });
}
