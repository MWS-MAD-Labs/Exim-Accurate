import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getOwnedCredential, getStaffAllowance } from "@/lib/pos-server";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(req.url).searchParams;
  const credentialId = params.get("credentialId");
  const email = params.get("email")?.toLowerCase().trim();
  if (!credentialId || !email) return NextResponse.json({ error: "credentialId and email are required" }, { status: 400 });
  const credential = await getOwnedCredential(session.user.id, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const allowance = await getStaffAllowance(credentialId, email);
  return NextResponse.json(allowance);
}
