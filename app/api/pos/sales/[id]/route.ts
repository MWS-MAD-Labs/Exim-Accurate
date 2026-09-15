import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOrganizationIdForUser } from "@/lib/organization";
import { externalPaymentMethodSchema, paymentStrategySchema, serializePayments } from "@/lib/pos-payments";
import { getStaffAllowance, isAdmin, lockStaffAllowancePeriod, reconcileSaleImmediateDebtSettlement, resolveStaffAllowancePeriod, saleTotal, withSerializableRetry } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const correctionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500),
  paymentStrategy: paymentStrategySchema,
  payments: z.array(z.object({
    method: z.enum(["allowance", "cash", "qris"]),
    amount: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/),
  })).min(1).max(2),
}).superRefine((value, context) => {
  if (new Set(value.payments.map((payment) => payment.method)).size !== value.payments.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["payments"], message: "Payment methods must be unique" });
  }
  if (value.paymentStrategy === "external_only") {
    if (value.payments.length !== 1 || !externalPaymentMethodSchema.safeParse(value.payments[0].method).success) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["payments"], message: "External-only requires exactly one Cash or QRIS allocation" });
    }
  } else if (value.paymentStrategy === "allowance_debt") {
    if (value.payments.length !== 1 || value.payments[0].method !== "allowance") {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["payments"], message: "Allowance debt requires one full allowance allocation" });
    }
  } else if (!value.payments.some((payment) => payment.method === "allowance") || value.payments.filter((payment) => payment.method !== "allowance").length > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["payments"], message: "Allowance-first requires allowance and at most one external allocation" });
  }
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = correctionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payment correction" }, { status: 400 });
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });
  const { id } = await params;

  try {
    const result = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findFirst({
        where: { id, credential: { organizationId } },
        include: { items: true, payments: true },
      });
      if (!sale) return null;
      if (["voiding", "voided"].includes(sale.status)) throw new Error("SALE_NOT_EDITABLE");
      if (sale.paymentVersion !== parsed.data.expectedVersion) throw new Error("PAYMENT_VERSION_CONFLICT");

      const total = saleTotal(sale.items);
      const payments = parsed.data.payments.map((payment) => ({ method: payment.method, amount: new Prisma.Decimal(payment.amount) }));
      if (payments.some((payment) => !payment.amount.greaterThan(0))) throw new Error("INVALID_PAYMENT_TOTAL");
      if (!payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0)).equals(total)) throw new Error("INVALID_PAYMENT_TOTAL");
      const allowancePayment = payments.find((payment) => payment.method === "allowance");
      if (allowancePayment && (sale.buyerType !== "staff" || !sale.staffEmail)) throw new Error("ALLOWANCE_REQUIRES_STAFF");
      if (parsed.data.paymentStrategy === "allowance_debt" && !allowancePayment?.amount.equals(total)) throw new Error("INVALID_PAYMENT_TOTAL");

      let periodStartsAt = sale.allowancePeriodStartsAt;
      let periodEndsAt = sale.allowancePeriodEndsAt;
      let balanceBefore: Prisma.Decimal | null = null;
      let balanceAfter: Prisma.Decimal | null = null;
      if (allowancePayment && sale.staffEmail) {
        const settings = await tx.posSettings.findUnique({ where: { credentialId: sale.credentialId } });
        const period = sale.allowancePeriodStartsAt && sale.allowancePeriodEndsAt
          ? { startsAt: sale.allowancePeriodStartsAt, endsAt: sale.allowancePeriodEndsAt }
          : (await resolveStaffAllowancePeriod(sale.credentialId, settings?.allowanceCutoffDay ?? 22, sale.createdAt, undefined, tx)).period;
        await lockStaffAllowancePeriod(tx, sale.credentialId, sale.staffEmail, period);
        const liveAllowance = await getStaffAllowance(
          sale.credentialId,
          sale.staffEmail,
          sale.createdAt,
          period,
          tx,
        );
        balanceBefore = new Prisma.Decimal(liveAllowance.remaining).add(sale.allowanceUsed);
        const positiveAvailable = Prisma.Decimal.max(balanceBefore, 0);
        const expectedAllowancePayment = Prisma.Decimal.min(total, positiveAvailable);
        if (parsed.data.paymentStrategy === "allowance_then_external" && !allowancePayment.amount.equals(expectedAllowancePayment)) {
          throw new Error(`ALLOWANCE_SPLIT_MISMATCH:${expectedAllowancePayment.toFixed(2)}:${allowancePayment.amount.toFixed(2)}`);
        }
        balanceAfter = balanceBefore.sub(allowancePayment.amount);
        periodStartsAt = period.startsAt;
        periodEndsAt = period.endsAt;
      }

      const previousPayments = serializePayments(sale.payments);
      const newPayments = serializePayments(payments);
      await tx.posSalePaymentRevision.create({
        data: {
          saleId: sale.id,
          changedById: session.user.id,
          reason: parsed.data.reason,
          previousStrategy: sale.paymentStrategy,
          newStrategy: parsed.data.paymentStrategy,
          previousPayments,
          newPayments,
        },
      });
      await tx.posSalePayment.deleteMany({ where: { saleId: sale.id } });
      await tx.posSalePayment.createMany({ data: payments.map((payment) => ({ saleId: sale.id, ...payment })) });
      const paymentMethod = payments.length > 1 ? "split" : payments[0].method;
      const allowanceUsed = allowancePayment
        ? parsed.data.paymentStrategy === "allowance_then_external"
          ? total
          : allowancePayment.amount
        : new Prisma.Decimal(0);
      if (allowancePayment && balanceBefore) balanceAfter = balanceBefore.sub(allowanceUsed);
      const updatedSale = await tx.posSale.update({
        where: { id: sale.id },
        data: {
          paymentStrategy: parsed.data.paymentStrategy,
          paymentMethod,
          allowanceUsed,
          allowancePeriodStartsAt: allowancePayment ? periodStartsAt : null,
          allowancePeriodEndsAt: allowancePayment ? periodEndsAt : null,
          allowanceBalanceBefore: balanceBefore,
          allowanceBalanceAfter: balanceAfter,
          paymentVersion: { increment: 1 },
        },
        include: { payments: true, paymentRevisions: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      if (allowancePayment && sale.staffEmail && periodStartsAt && periodEndsAt) {
        const externalPayment = payments.find((payment) => payment.method === "cash" || payment.method === "qris");
        await reconcileSaleImmediateDebtSettlement(tx, {
          saleId: sale.id,
          credentialId: sale.credentialId,
          staffEmail: sale.staffEmail,
          period: { startsAt: periodStartsAt, endsAt: periodEndsAt },
          createdById: session.user.id,
          settlement: parsed.data.paymentStrategy === "allowance_then_external" && externalPayment
            ? { method: externalPayment.method as "cash" | "qris", amount: externalPayment.amount }
            : null,
          createdAt: sale.createdAt,
        });
      } else {
        await tx.posStaffAllowanceDebtSettlement.deleteMany({ where: { saleId: sale.id } });
      }
      return updatedSale;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
    if (!result) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json({ sale: { ...result, payments: serializePayments(result.payments) } });
  } catch (error) {
    if (error instanceof Error && error.message === "SALE_NOT_EDITABLE") return NextResponse.json({ error: "Voiding or voided sales cannot be edited" }, { status: 409 });
    if (error instanceof Error && error.message === "PAYMENT_VERSION_CONFLICT") return NextResponse.json({ code: "PAYMENT_VERSION_CONFLICT", error: "Payment details changed. Reload before correcting them." }, { status: 409 });
    if (error instanceof Error && error.message.startsWith("ALLOWANCE_SPLIT_MISMATCH:")) {
      const [, available, requested] = error.message.split(":");
      return NextResponse.json({
        code: "ALLOWANCE_EXCEEDS_AVAILABLE",
        error: `Allowance-first must use exactly ${available} of available allowance; ${requested} was requested. Use the calculated split or choose another payment strategy.`,
        allowance: { available, requested },
      }, { status: 409 });
    }
    if (error instanceof Error && ["INVALID_PAYMENT_TOTAL", "ALLOWANCE_REQUIRES_STAFF"].includes(error.message)) return NextResponse.json({ error: "Payment allocations are invalid for this sale" }, { status: 409 });
    console.error(`[pos/sales/${id}] Failed to correct payment allocations`, error);
    return NextResponse.json({ error: "Unable to update payment allocations" }, { status: 500 });
  }
}
