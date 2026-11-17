import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPrincipalWithPermission } from "@/lib/principal";
import { LINK_MESSAGES, linkUserToCentral, type LinkError } from "@/lib/central-link";

const bodySchema = z.object({ email: z.string().trim().email().max(254) });

const STATUS: Record<LinkError, number> = {
  NOT_FOUND: 404,
  ALREADY_LINKED: 409,
  CENTRAL_UNAVAILABLE: 502,
  PERSON_NOT_FOUND: 404,
  PERSON_INACTIVE: 422,
  OTHER_ORGANIZATION: 403,
  PERSON_HAS_ACCOUNT: 409,
  RECORDS_OVERLAP: 409,
};

// Ties an older account without a Central identity to the person Central has under this email.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getPrincipalWithPermission("users.manage");
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the email the person has in Central." }, { status: 400 });

  const { id } = await params;
  const result = await linkUserToCentral({ userId: id, organizationId: admin.organizationId, centralEmail: parsed.data.email });
  if (!result.ok) return NextResponse.json({ error: LINK_MESSAGES[result.error], code: result.error }, { status: STATUS[result.error] });

  console.info("[users] Linked to Central", { by: admin.email, user: id, person: result.personId });
  return NextResponse.json({ linked: { name: result.name, email: result.email } });
}
