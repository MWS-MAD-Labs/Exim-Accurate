import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listWarehouses } from "@/lib/accurate/pos";
import { getOwnedCredential, isAdmin } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const credentialId = new URL(req.url).searchParams.get("credentialId");
  if (!credentialId) return NextResponse.json({ error: "Credential is required" }, { status: 400 });
  const credential = await getOwnedCredential(session.user.id, credentialId);
  if (!credential || !credential.host || !credential.session) return NextResponse.json({ error: "Credential unavailable" }, { status: 404 });
  try { return NextResponse.json(await listWarehouses({ apiToken: credential.apiToken, signatureSecret: credential.signatureSecret, host: credential.host, session: credential.session })); } catch { return NextResponse.json({ error: "Unable to load warehouses" }, { status: 502 }); }
}
