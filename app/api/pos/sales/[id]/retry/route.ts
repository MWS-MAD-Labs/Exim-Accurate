import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";


export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const sale = await prisma.posSale.findFirst({ where: { id, userId: session.user.id }, include: { items: true } });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (sale.status === "synced") return NextResponse.json(sale);
  return NextResponse.json({
    sale,
    error: "This sale has no confirmed Accurate adjustment ID. Retrying it could create a duplicate inventory adjustment, so it requires manual reconciliation first.",
  }, { status: 409 });
}
