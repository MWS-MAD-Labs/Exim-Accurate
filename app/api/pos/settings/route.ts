import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listWarehouses } from "@/lib/accurate/pos";
import { isAdmin } from "@/lib/pos-server";
import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schema = z.object({
  credentialId: z.string().uuid(),
  warehouseId: z.number().int().positive(),
  warehouseName: z.string().trim().min(1),
  allowancePerWorkingDay: z.number().finite().nonnegative().default(0),
  workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).default([1, 2, 3, 4, 5]),
  holidayDates: z.array(dateOnlySchema).default([]),
  allowanceCutoffDay: z.number().int().min(1).max(28).default(22),
  preorderHoldHours: z.number().int().min(1).max(168).default(4),
  allowancePeriodOverrides: z.array(z.object({
    startsAt: dateOnlySchema,
    endsAt: dateOnlySchema,
  }).refine(({ startsAt, endsAt }) => startsAt <= endsAt, { message: "The start date must not be after the cutoff date" })).default([]),
}).superRefine(({ allowancePeriodOverrides }, context) => {
  const sorted = [...allowancePeriodOverrides].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].startsAt <= sorted[index - 1].endsAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Custom allowance periods cannot overlap", path: ["allowancePeriodOverrides", index] });
    }
  }
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const settings = await prisma.posSettings.findMany({
    where: {},
    select: {
      id: true, credentialId: true, warehouseId: true, warehouseName: true, isActive: true, allowancePerWorkingDay: true, workingDays: true,
      holidayDates: true, allowanceCutoffDay: true, preorderHoldHours: true, updatedAt: true,
    },
  });
  const overrides = await prisma.posAllowancePeriodOverride.findMany({
    where: { credentialId: { in: settings.map((setting) => setting.credentialId) } },
    select: { id: true, credentialId: true, startsAt: true, endsAt: true },
    orderBy: { startsAt: "asc" },
  });
  const overridesByCredential = overrides.reduce((grouped, override) => {
    const current = grouped.get(override.credentialId) ?? [];
    current.push(override);
    grouped.set(override.credentialId, current);
    return grouped;
  }, new Map<string, typeof overrides>());
  return NextResponse.json(settings.map((setting) => ({
    ...setting,
    allowancePeriodOverrides: overridesByCredential.get(setting.credentialId) ?? [],
  })));
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  const { credentialId, warehouseId, warehouseName, allowancePerWorkingDay, workingDays, holidayDates, allowanceCutoffDay, preorderHoldHours, allowancePeriodOverrides } = parsed.data;
  const credential = await prisma.accurateCredentials.findUnique({ where: { id: credentialId } });
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!credential.host || !credential.session) return NextResponse.json({ error: "Accurate session is not ready" }, { status: 409 });
  try {
    const warehouses = await listWarehouses({ apiToken: credential.apiToken, signatureSecret: credential.signatureSecret, host: credential.host, session: credential.session });
    const warehouse = warehouses.find((candidate) => candidate.id === warehouseId && candidate.name === warehouseName);
    if (!warehouse) return NextResponse.json({ error: "Warehouse is not valid for this credential" }, { status: 409 });
    const settings = await prisma.$transaction(async (tx) => {
      await tx.posSettings.updateMany({
        where: { credentialId: { not: credentialId }, isActive: true },
        data: { isActive: false },
      });
      const saved = await tx.posSettings.upsert({
        where: { credentialId },
        update: { warehouseId, warehouseName, isActive: true, allowancePerWorkingDay, workingDays, holidayDates, allowanceCutoffDay, preorderHoldHours },
        create: { userId: session.user.id, credentialId, warehouseId, warehouseName, isActive: true, allowancePerWorkingDay, workingDays, holidayDates, allowanceCutoffDay, preorderHoldHours },
      });
      await tx.posAllowancePeriodOverride.deleteMany({ where: { credentialId } });
      if (allowancePeriodOverrides.length) {
        await tx.posAllowancePeriodOverride.createMany({
          data: allowancePeriodOverrides.map((period) => ({
            credentialId,
            startsAt: new Date(`${period.startsAt}T00:00:00`),
            endsAt: new Date(`${period.endsAt}T00:00:00`),
          })),
        });
      }
      return saved;
    });
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: "Unable to load Accurate warehouses" }, { status: 502 });
  }
}
