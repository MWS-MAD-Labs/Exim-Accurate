import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOrganizationIdForUser } from "@/lib/organization";
import { paymentMethodSchema } from "@/lib/pos";
import { isAdmin, saleAllowanceUsed, withSerializableRetry } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const updateSaleSchema = z.object({
  paymentMethod: paymentMethodSchema,
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = updateSaleSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });

  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });

  const { id } = await params;

  try {
    const result = await withSerializableRetry(() => prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findFirst({
        where: { id, credential: { organizationId } },
        include: { items: true },
      });
      if (!sale) return null;
      if (sale.status === "voiding" || sale.status === "voided") throw new Error("SALE_NOT_EDITABLE");

      const allowanceUsed = saleAllowanceUsed(
        sale.buyerType,
        parsed.data.paymentMethod,
        sale.items,
      );

      const changed = await tx.posSale.updateMany({
        where: { id: sale.id, status: { notIn: ["voiding", "voided"] } },
        data: {
          paymentMethod: parsed.data.paymentMethod,
          allowanceUsed,
        },
      });
      if (changed.count !== 1) throw new Error("SALE_NOT_EDITABLE");

      return tx.posSale.findUnique({
        where: { id: sale.id },
        select: {
          id: true,
          paymentMethod: true,
          allowanceUsed: true,
          status: true,
        },
      });
    }, { isolationLevel: "Serializable" }));

    if (!result) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json({ sale: result });
  } catch (error) {
    if (error instanceof Error && error.message === "ALLOWANCE_REQUIRES_STAFF") {
      return NextResponse.json({ error: "Allowance can only be used for staff transactions" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "SALE_NOT_EDITABLE") {
      return NextResponse.json({ error: "Voiding or voided sales cannot be edited" }, { status: 409 });
    }
    console.error(`[pos/sales/${id}] Failed to update payment method`, error);
    return NextResponse.json({ error: "Unable to update payment method" }, { status: 500 });
  }
}
