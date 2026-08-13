import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getCurrentAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { USER_ROLES } from "@/lib/user-roles";

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  password: z.string().min(8, "Password must contain at least 8 characters."),
  role: z.enum(USER_ROLES),
});

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    where: { organizationId: admin.organizationId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          accurateCredentials: true,
          exportJobs: true,
          importJobs: true,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }, { email: "asc" }],
  });

  return NextResponse.json({ users, currentUserId: admin.id });
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const parsed = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid user details." },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        organizationId: admin.organizationId,
        email: parsed.data.email,
        name: parsed.data.name,
        password: await bcrypt.hash(parsed.data.password, 12),
        role: parsed.data.role,
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A user with this email already exists." },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: "Unable to create user." }, { status: 500 });
  }
}
