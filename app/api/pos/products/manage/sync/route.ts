import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPosContext, isAdmin } from "@/lib/pos-server";
import { syncPosProduct } from "@/lib/accurate/pos";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { credentialId?: string } | null;
  if (!body?.credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const context = await getPosContext(session.user.id, body.credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings || !context.accurate) return NextResponse.json({ error: "POS is not configured" }, { status: 409 });

  const products = await prisma.posProduct.findMany({
    where: { credentialId: body.credentialId },
    orderBy: { itemCode: "asc" },
  });
  const results: Array<{ itemCode: string; status: "synced" | "error"; error?: string }> = [];

  for (const product of products) {
    try {
      const synced = await syncPosProduct(
        context.accurate,
        { id: context.settings.warehouseId, name: context.settings.warehouseName },
        {
          accurateItemId: product.accurateItemId,
          itemCode: product.itemCode,
          itemName: product.itemName,
          unit: product.unit || "PCS",
          stock: product.stock,
          buyPrice: Number(product.buyPrice),
          sellPrice: Number(product.sellPrice),
        },
      );
      await prisma.posProduct.update({
        where: { id: product.id },
        data: {
          accurateItemId: synced.accurateItemId,
          syncStatus: "synced",
          syncError: null,
          lastSyncedAt: new Date(),
        },
      });
      results.push({ itemCode: product.itemCode, status: "synced" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown synchronization error";
      await prisma.posProduct.update({
        where: { id: product.id },
        data: { syncStatus: "error", syncError: message },
      });
      results.push({ itemCode: product.itemCode, status: "error", error: message });
    }
  }

  const failedResults = results.filter((result) => result.status === "error");
  const failed = failedResults.length;
  return NextResponse.json(
    {
      synced: results.length - failed,
      failed,
      results,
      error: failedResults[0]?.error,
    },
    { status: failed > 0 ? 207 : 200 },
  );
}
