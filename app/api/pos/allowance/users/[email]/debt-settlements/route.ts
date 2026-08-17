import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { prisma } from "@/lib/prisma";
import { getOutstandingPreviousAllowanceDebt, isAdmin, withSerializableRetry } from "@/lib/pos-server";

const schema = z.object({
  credentialId: z.string().uuid(),
  periodStartsAt: dateOnlySchema,
  periodEndsAt: dateOnlySchema,
  amount: z.number().finite().positive(),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid debt payment" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  if (!z.string().email().safeParse(staffEmail).success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });

  const debtStatus = await getOutstandingPreviousAllowanceDebt(parsed.data.credentialId, staffEmail);
  const requestedStartsAt = parseDateOnly(parsed.data.periodStartsAt);
  const requestedEndsAt = parseDateOnly(parsed.data.periodEndsAt);
  if (
    requestedStartsAt.getTime() !== new Date(debtStatus.period.startsAt).getTime() ||
    requestedEndsAt.getTime() !== new Date(debtStatus.period.endsAt).getTime()
  ) {
    return NextResponse.json({ error: "Debt period is no longer the previous allowance period", previousDebt: debtStatus }, { status: 409 });
  }
  if (!debtStatus.blocked) return NextResponse.json({ error: "There is no outstanding previous-period debt", previousDebt: debtStatus }, { status: 409 });

  const settlement = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const settlements = await tx.posStaffAllowanceDebtSettlement.aggregate({
      where: {
        credentialId: parsed.data.credentialId,
        staffEmail,
        periodStartsAt: requestedStartsAt,
        periodEndsAt: requestedEndsAt,
      },
      _sum: { amount: true },
    });
    const outstanding = Math.max(0, debtStatus.debt - Math.max(0, Number(settlements._sum.amount ?? 0)));
    if (outstanding <= 0) throw new Error("DEBT_ALREADY_PAID");
    if (parsed.data.amount > outstanding) throw new Error("PAYMENT_EXCEEDS_DEBT");
    return tx.posStaffAllowanceDebtSettlement.create({
      data: {
        credentialId: parsed.data.credentialId,
        staffEmail,
        periodStartsAt: requestedStartsAt,
        periodEndsAt: requestedEndsAt,
        amount: parsed.data.amount,
        note: parsed.data.note || null,
        createdById: session.user.id,
      },
    });
  }, { isolationLevel: "Serializable" })).catch((error: unknown) => {
    if (error instanceof Error && ["DEBT_ALREADY_PAID", "PAYMENT_EXCEEDS_DEBT"].includes(error.message)) return error.message;
    throw error;
  });
  if (settlement === "DEBT_ALREADY_PAID") return NextResponse.json({ error: "There is no outstanding previous-period debt" }, { status: 409 });
  if (settlement === "PAYMENT_EXCEEDS_DEBT") return NextResponse.json({ error: "Payment exceeds the outstanding debt" }, { status: 400 });
  const previousDebt = await getOutstandingPreviousAllowanceDebt(parsed.data.credentialId, staffEmail);
  return NextResponse.json({ settlement, previousDebt }, { status: 201 });
}
