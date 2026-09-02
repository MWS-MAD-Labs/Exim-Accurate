import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { USER_ROLES } from "@/lib/user-roles";

const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").optional(),
    role: z.enum(USER_ROLES).optional(),
    password: z.string().min(8, "Password must contain at least 8 characters.").optional(),
  })
  .refine((data) => data.name || data.role || data.password, {
    message: "Provide a name, role, or a new password.",
  });

async function wouldRemoveLastAdmin(userId: string, nextRole?: string) {
  if (!nextRole || nextRole === "admin") return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, organizationId: true },
  });
  if (user?.role !== "admin") return false;

  return (await prisma.user.count({
    where: { role: "admin", organizationId: user.organizationId },
  })) <= 1;
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
    select: { id: true, organizationId: true },
  });
  if (!existingUser || existingUser.organizationId !== admin.organizationId) {
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
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.password
        ? { password: await bcrypt.hash(parsed.data.password, 12) }
        : {}),
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
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
    select: { role: true, organizationId: true },
  });
  if (!user || user.organizationId !== admin.organizationId) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (user.role === "admin" && (await prisma.user.count({
    where: { role: "admin", organizationId: user.organizationId },
  })) <= 1) {
    return NextResponse.json(
      { error: "The system must keep at least one administrator." },
      { status: 409 },
    );
  }

  const posSalesCount = await prisma.posSale.count({
    where: { OR: [{ userId: id }, { voidedById: id }] },
  });
  if (posSalesCount > 0) {
    return NextResponse.json(
      { error: "This user has POS sales history and cannot be deleted. Change their role or disable their access instead." },
      { status: 409 },
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { error: "This user is referenced by retained audit history and cannot be deleted. Change their role or disable their access instead." },
        { status: 409 },
      );
    }
    throw error;
  }
}
