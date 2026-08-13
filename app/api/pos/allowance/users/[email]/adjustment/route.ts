import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { isAdmin } from "@/lib/pos-server";
const schema = z.object({
  credentialId: z.string().uuid(),
  periodStartsAt: dateOnlySchema,
  periodEndsAt: dateOnlySchema,
  amount: z.number().finite(),
  note: z.string().trim().max(500).optional(),
}).refine(({ periodStartsAt, periodEndsAt }) => periodStartsAt <= periodEndsAt, {
  message: "periodStartsAt must not be after periodEndsAt",
});


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid adjustment" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  if (!z.string().email().safeParse(staffEmail).success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });
  const periodStartsAt = parseDateOnly(parsed.data.periodStartsAt);
  const periodEndsAt = parseDateOnly(parsed.data.periodEndsAt);
  const adjustment = await prisma.posStaffAllowanceAdjustment.upsert({
    where: {
      credentialId_staffEmail_periodStartsAt_periodEndsAt: {
        credentialId: parsed.data.credentialId,
        staffEmail,
        periodStartsAt,
        periodEndsAt,
      },
    },
    update: { amount: parsed.data.amount, note: parsed.data.note || null },
    create: {
      credentialId: parsed.data.credentialId,
      staffEmail,
      periodStartsAt,
      periodEndsAt,
      amount: parsed.data.amount,
      note: parsed.data.note || null,
      createdById: session.user.id,
    },
  });
  return NextResponse.json(adjustment);
}
