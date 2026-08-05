import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPosContext } from "@/lib/pos-server";
import { resolvePosStock } from "@/lib/accurate/pos";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { credentialId?: string } | null;
  if (!body?.credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const context = await getPosContext(session.user.id, body.credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings || !context.accurate) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });

  const products = await prisma.posProduct.findMany({ where: { credentialId: body.credentialId } });
  if (products.length === 0) return NextResponse.json({ synced: 0 });

  const stockByCode = await resolvePosStock(
    context.accurate,
    { id: context.settings.warehouseId, name: context.settings.warehouseName },
    products.map((product) => product.itemCode),
  );

  const now = new Date();
  await Promise.all(
    products.map((product) => {
      const stock = stockByCode.get(product.itemCode);
      if (stock === undefined) return null;
      return prisma.posProduct.update({ where: { id: product.id }, data: { stockCache: stock, lastSyncedAt: now } });
    }),
  );

  return NextResponse.json({ synced: stockByCode.size });
}
