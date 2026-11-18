import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalWithPermission } from "@/lib/principal";
import { MERGE_MESSAGES, mergeIntoCentralPerson } from "@/lib/user-merge";

const bodySchema = z.object({ email: z.string().trim().email().max(254), apply: z.boolean().optional() });

const STATUS: Record<keyof typeof MERGE_MESSAGES, number> = {
  NOT_FOUND: 404,
  SAME_ACCOUNT: 409,
  OTHER_ORGANIZATION: 403,
  OLD_IS_LINKED: 409,
  TARGET_NOT_LINKED: 409,
  STAFF_ROWS_CLASH: 409,
  KEYS_CLASH: 409,
  CENTRAL_UNAVAILABLE: 502,
  PERSON_NOT_FOUND: 404,
  PERSON_INACTIVE: 422,
  NO_ACCOUNT: 404,
};

// Moves an older account without a Central identity into the account Exima already has for the person Central
// knows under this email, then removes it. Without `apply` it only says what would move.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getPrincipalWithPermission("users.manage");
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email the person has in Central." }, { status: 400 });

  const { id } = await params;
  const result = await mergeIntoCentralPerson({
    userId: id,
    organizationId: admin.organizationId,
    centralEmail: parsed.data.email,
    apply: parsed.data.apply === true,
  });
  if (!result.ok) {
    return NextResponse.json({ error: MERGE_MESSAGES[result.error], code: result.error, blockers: result.blockers }, { status: STATUS[result.error] });
  }

  if (result.applied) {
    console.info("[users] Merged accounts", { by: admin.email, from: result.plan.from.id, fromEmail: result.plan.from.email, into: result.plan.into.id });
  }
  const { plan } = result;
  return NextResponse.json({
    applied: result.applied,
    from: { email: plan.from.email, name: plan.from.name },
    into: { email: plan.into.email, name: plan.into.name },
    moves: plan.moves.filter((move) => move.rows > 0),
    staffRows: plan.staffRows,
    blockers: plan.blockers.map((code) => ({ code, message: MERGE_MESSAGES[code] })),
  });
}
