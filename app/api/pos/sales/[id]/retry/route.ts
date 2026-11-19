import { seesAllSales } from "@/lib/credential-view";
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/access-control";
import { getOrganizationIdForUser } from "@/lib/organization";
import { retryPosSaleNow } from "@/lib/pos-sale-sync";


export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "pos.checkout")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const sale = await prisma.posSale.findFirst({
    where: {
      id,
      credential: { organizationId },
      ...(seesAllSales(session.user.permissions) ? {} : { userId: session.user.id }),
    },
    include: { items: true },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (sale.status === "voiding" || sale.status === "voided") {
    return NextResponse.json({ sale, error: "Voided or void-in-progress sales cannot be re-synced." }, { status: 409 });
  }
  if (sale.status === "synced") return NextResponse.json(sale);
  // Retrying is safe: the sync looks for the adjustment of this sale in Accurate before it makes one. Only a sale in error waits
  // for a backoff; one still pending is already queued for the next run.
  const outcome = await retryPosSaleNow(sale.id);
  const fresh = await prisma.posSale.findUnique({ where: { id: sale.id }, include: { items: true } });
  return NextResponse.json({ sale: fresh, queued: outcome === "queued" });
}
