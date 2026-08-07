import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { USER_ROLES } from "@/lib/user-roles";

const updateUserSchema = z
  .object({
    role: z.enum(USER_ROLES).optional(),
    password: z.string().min(8, "Password must contain at least 8 characters.").optional(),
  })
  .refine((data) => data.role || data.password, {
    message: "Provide a role or a new password.",
  });

async function wouldRemoveLastAdmin(userId: string, nextRole?: string) {
  if (!nextRole || nextRole === "admin") return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role !== "admin") return false;

  return (await prisma.user.count({ where: { role: "admin" } })) <= 1;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const parsed = updateUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid user details." },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existingUser) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (await wouldRemoveLastAdmin(id, parsed.data.role)) {
    return NextResponse.json(
      { error: "The system must keep at least one administrator." },
      { status: 409 },
    );
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.password
        ? { password: await bcrypt.hash(parsed.data.password, 12) }
        : {}),
    },
    select: { id: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const { id } = await params;
  if (id === admin.id) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { role: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.role === "admin" && (await prisma.user.count({ where: { role: "admin" } })) <= 1) {
    return NextResponse.json(
      { error: "The system must keep at least one administrator." },
      { status: 409 },
    );
  }

  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
