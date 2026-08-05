import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchPosProducts } from "@/lib/accurate/pos";
import { getPosContext } from "@/lib/pos-server";

// Raw Accurate item search (not filtered by the local POS catalog), used only when
// building/editing the catalog in Stock Management.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const credentialId = params.get("credentialId");
  if (!credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings) return NextResponse.json({ error: "POS warehouse is not configured" }, { status: 409 });
  if (!context.accurate) return NextResponse.json({ error: "Accurate session is not ready" }, { status: 409 });
  try {
    const products = await searchPosProducts(context.accurate, { id: context.settings.warehouseId, name: context.settings.warehouseName }, params.get("q") || "");
    return NextResponse.json({ warehouse: context.settings, products });
  } catch {
    return NextResponse.json({ error: "Unable to load products from Accurate" }, { status: 502 });
  }
}
