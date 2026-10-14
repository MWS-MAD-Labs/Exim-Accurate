import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { z } from "zod";
import { hasPermission } from "@/lib/access-control";
import { badgeRefusal } from "@/lib/badge-messages";
import { identifyStaffForCashier } from "@/lib/cashier-identify";
import { getOperationalPosCredential } from "@/lib/credential-access";

const bodySchema = z.object({
  credentialId: z.string().uuid(),
  value: z.string().trim().min(1).max(254),
});

// The cashier's reader finished: who is this?
export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "pos.checkout")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const credential = await getOperationalPosCredential(session.user.id, session.user.permissions, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const identity = await identifyStaffForCashier(parsed.data.value, credential.organizationId);
  if (!identity.ok) {
    return NextResponse.json(badgeRefusal(identity.reason), { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  return NextResponse.json(
    { personId: identity.personId, email: identity.email, name: identity.name },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
