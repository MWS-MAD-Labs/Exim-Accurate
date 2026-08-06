import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPosContext, resolveLocalPosProducts } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const credentialId = params.get("credentialId");
  if (!credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  if (!context.settings) return NextResponse.json({ error: "POS warehouse is not configured" }, { status: 409 });
  const products = await resolveLocalPosProducts(
    credentialId,
    { id: context.settings.warehouseId, name: context.settings.warehouseName },
    undefined,
    params.get("q") || "",
  );
  return NextResponse.json({ warehouse: context.settings, products });
}
