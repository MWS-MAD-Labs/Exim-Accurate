import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStaffAllowance } from "@/lib/pos-server";
import { canOperatePos } from "@/lib/access-control";
import { getOperationalPosCredential } from "@/lib/credential-access";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const params = new URL(req.url).searchParams;
  const credentialId = params.get("credentialId");
  const email = params.get("email")?.toLowerCase().trim();
  if (!credentialId || !email) return NextResponse.json({ error: "credentialId and email are required" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const allowance = await getStaffAllowance(credentialId, email);
  return NextResponse.json(allowance);
}
