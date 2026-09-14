import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { prisma } from "@/lib/prisma";
import { getOutstandingCurrentAllowanceDebt, getOutstandingPreviousAllowanceDebt, withSerializableRetry } from "@/lib/pos-server";
import { recordValidatedDebtSettlement, validateDebtSettlement } from "@/lib/pos-debt-settlement";
import { canOperatePos } from "@/lib/access-control";

const schema = z.object({
  credentialId: z.string().uuid(),
  periodStartsAt: dateOnlySchema,
  periodEndsAt: dateOnlySchema,
  amount: z.number().finite().positive(),
  paymentMethod: z.enum(["cash", "qris"]),
  note: z.string().trim().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "POS operator access required" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid debt payment" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  if (!z.string().email().safeParse(staffEmail).success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });

  const requestedStartsAt = parseDateOnly(parsed.data.periodStartsAt);
  const requestedEndsAt = parseDateOnly(parsed.data.periodEndsAt);
  const requestedPeriod = { startsAt: requestedStartsAt, endsAt: requestedEndsAt };
  const [currentDebt, previousDebt] = await Promise.all([
    getOutstandingCurrentAllowanceDebt(parsed.data.credentialId, staffEmail),
    getOutstandingPreviousAllowanceDebt(parsed.data.credentialId, staffEmail),
  ]);
  try {
    validateDebtSettlement({ requestedPeriod, amount: parsed.data.amount, currentDebt, previousDebt });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "DEBT_PERIOD_CHANGED") return NextResponse.json({ code, error: "Debt period is no longer payable", currentDebt, previousDebt }, { status: 409 });
    if (code === "DEBT_ALREADY_PAID") return NextResponse.json({ code, error: "There is no outstanding debt for this period", currentDebt, previousDebt }, { status: 409 });
    if (code === "PAYMENT_EXCEEDS_DEBT") return NextResponse.json({ code, error: "Payment exceeds the outstanding debt", currentDebt, previousDebt }, { status: 400 });
    throw error;
  }

  const settlement = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
    const transactionNow = new Date();
    return recordValidatedDebtSettlement({
      requestedPeriod,
      amount: parsed.data.amount,
      loadDebts: async () => {
        const [transactionCurrentDebt, transactionPreviousDebt] = await Promise.all([
          getOutstandingCurrentAllowanceDebt(parsed.data.credentialId, staffEmail, transactionNow, undefined, tx),
          getOutstandingPreviousAllowanceDebt(parsed.data.credentialId, staffEmail, transactionNow, undefined, tx),
        ]);
        return { currentDebt: transactionCurrentDebt, previousDebt: transactionPreviousDebt };
      },
      createSettlement: () => tx.posStaffAllowanceDebtSettlement.create({
        data: {
          credentialId: parsed.data.credentialId,
          staffEmail,
          periodStartsAt: requestedStartsAt,
          periodEndsAt: requestedEndsAt,
          amount: parsed.data.amount,
          paymentMethod: parsed.data.paymentMethod,
          note: parsed.data.note || null,
          createdById: session.user.id,
        },
      }),
    });
  }, { isolationLevel: "Serializable" })).catch((error: unknown) => {
    if (error instanceof Error && ["DEBT_PERIOD_CHANGED", "DEBT_ALREADY_PAID", "PAYMENT_EXCEEDS_DEBT"].includes(error.message)) return error.message;
    throw error;
  });
  const refreshedDebt = async () => {
    const [refreshedCurrentDebt, refreshedPreviousDebt] = await Promise.all([
      getOutstandingCurrentAllowanceDebt(parsed.data.credentialId, staffEmail),
      getOutstandingPreviousAllowanceDebt(parsed.data.credentialId, staffEmail),
    ]);
    return { currentDebt: refreshedCurrentDebt, previousDebt: refreshedPreviousDebt };
  };
  if (settlement === "DEBT_PERIOD_CHANGED") {
    return NextResponse.json({ code: "DEBT_PERIOD_CHANGED", error: "Debt period is no longer payable", ...await refreshedDebt() }, { status: 409 });
  }
  if (settlement === "DEBT_ALREADY_PAID") {
    return NextResponse.json({ code: "DEBT_ALREADY_PAID", error: "There is no outstanding debt for this period", ...await refreshedDebt() }, { status: 409 });
  }
  if (settlement === "PAYMENT_EXCEEDS_DEBT") {
    return NextResponse.json({ code: "PAYMENT_EXCEEDS_DEBT", error: "Payment exceeds the outstanding debt", ...await refreshedDebt() }, { status: 400 });
  }
  return NextResponse.json({ settlement, ...await refreshedDebt() }, { status: 201 });
}
