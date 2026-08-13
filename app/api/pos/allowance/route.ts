import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getStaffAllowance } from "@/lib/pos-server";
import { canOperatePos } from "@/lib/access-control";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canOperatePos(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({
    credentialId: z.string().uuid(),
    email: z.string().trim().email().transform((email) => email.toLowerCase()),
    periodStart: dateOnlySchema.optional(),
    periodEnd: dateOnlySchema.optional(),
  }).refine((value) => !!value.periodStart === !!value.periodEnd, {
    message: "periodStart and periodEnd must be provided together",
  }).refine((value) => !value.periodStart || value.periodStart <= value.periodEnd!, {
    message: "periodStart must not be after periodEnd",
  }).safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid query" }, { status: 400 });
  const { credentialId, email, periodStart, periodEnd } = parsed.data;
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  const requestedPeriod = periodStart && periodEnd
    ? { startsAt: parseDateOnly(periodStart), endsAt: parseDateOnly(periodEnd) }
    : undefined;
  const allowance = await getStaffAllowance(credentialId, email, new Date(), requestedPeriod);
  return NextResponse.json(allowance);
}
