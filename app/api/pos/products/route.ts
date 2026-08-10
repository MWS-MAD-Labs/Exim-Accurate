import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDefaultPosStore, getPosContext, getStaffAllowance, resolveLocalPosProducts } from "@/lib/pos-server";
import { canBrowsePosCatalog } from "@/lib/access-control";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canBrowsePosCatalog(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const requestedCredentialId = params.get("credentialId");
  const defaultStore = requestedCredentialId ? null : await getDefaultPosStore(session.user.id);
  const credentialId = requestedCredentialId ?? defaultStore?.credentialId;
  if (!credentialId) {
    return NextResponse.json({ error: "POS store is not configured" }, { status: 409 });
  }

  const context = await getPosContext(session.user.id, credentialId);
  if (!context) return NextResponse.json({ error: "POS store is not available" }, { status: 404 });
  if (!context.settings) return NextResponse.json({ error: "POS warehouse is not configured" }, { status: 409 });
  const products = await resolveLocalPosProducts(
    credentialId,
    { id: context.settings.warehouseId, name: context.settings.warehouseName },
    undefined,
    params.get("q") || "",
  );
  const allowance = session.user.email
    ? await getStaffAllowance(credentialId, session.user.email)
    : null;
  return NextResponse.json({
    store: {
      warehouseName: context.settings.warehouseName,
      holdHours: context.settings.preorderHoldHours,
    },
    allowance,
    products,
  });
}
