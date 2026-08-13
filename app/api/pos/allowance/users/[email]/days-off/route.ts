import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { dateOnlySchema, parseDateOnly } from "@/lib/pos";
import { isAdmin } from "@/lib/pos-server";
const createSchema = z.object({
  credentialId: z.string().uuid(),
  dates: z.array(dateOnlySchema).min(1),
  reason: z.string().trim().max(500).optional(),
});
const deleteSchema = z.object({ credentialId: z.string().uuid(), date: dateOnlySchema });


async function authorize(userId: string, role: string | null | undefined, credentialId: string) {
  if (!isAdmin(role)) return { error: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  const credential = await getOperationalPosCredential(userId, role, credentialId);
  if (!credential) return { error: NextResponse.json({ error: "Credential not found" }, { status: 404 }) };
  return { credential };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid days off" }, { status: 400 });
  const authorization = await authorize(session.user.id, session.user.role, parsed.data.credentialId);
  if (authorization.error) return authorization.error;

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  if (!z.string().email().safeParse(staffEmail).success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });
  // Leave records are period-neutral so planned future leave and historical corrections remain representable.
  // Allowance calculations only count records that overlap the requested period and an eligible working day.
  const uniqueDates = [...new Set(parsed.data.dates)];
  await prisma.$transaction(uniqueDates.map((date) => prisma.posStaffDayOff.upsert({
    where: { credentialId_staffEmail_date: { credentialId: parsed.data.credentialId, staffEmail, date: parseDateOnly(date) } },
    update: { reason: parsed.data.reason || null },
    create: { credentialId: parsed.data.credentialId, staffEmail, date: parseDateOnly(date), reason: parsed.data.reason || null },
  })));
  return NextResponse.json({ created: uniqueDates.length }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid day off" }, { status: 400 });
  const authorization = await authorize(session.user.id, session.user.role, parsed.data.credentialId);
  if (authorization.error) return authorization.error;

  const staffEmail = decodeURIComponent((await params).email).toLowerCase().trim();
  if (!z.string().email().safeParse(staffEmail).success) return NextResponse.json({ error: "Invalid staff email" }, { status: 400 });
  await prisma.posStaffDayOff.deleteMany({
    where: { credentialId: parsed.data.credentialId, staffEmail, date: parseDateOnly(parsed.data.date) },
  });
  return NextResponse.json({ success: true });
}
