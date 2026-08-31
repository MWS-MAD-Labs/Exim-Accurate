import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getOrganizationIdForUser } from "@/lib/organization";
import { isAdmin } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const HISTORY_LIMIT = 200;

const querySchema = z.object({
  productId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = querySchema.safeParse({
    productId: new URL(req.url).searchParams.get("productId"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Product is required" }, { status: 400 });

  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Organization not found" }, { status: 403 });

  const product = await prisma.posProduct.findFirst({
    where: { id: parsed.data.productId, credential: { organizationId } },
    select: { id: true, itemCode: true, itemName: true, stock: true },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const changes = await prisma.posStockChange.findMany({
    where: { productId: product.id },
    include: {
      user: { select: { name: true, email: true } },
      sale: { select: { id: true, paymentMethod: true } },
    },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT + 1,
  });
  const truncated = changes.length > HISTORY_LIMIT;

  return NextResponse.json({ product, changes: changes.slice(0, HISTORY_LIMIT), truncated });
}
