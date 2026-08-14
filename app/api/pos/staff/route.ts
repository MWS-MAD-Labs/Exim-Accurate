import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { canOperatePos } from "@/lib/access-control";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  credentialId: z.string().uuid(),
  search: z.string().trim().max(254).default(""),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canOperatePos(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid query" },
      { status: 400 },
    );
  }

  const credential = await getOperationalPosCredential(
    session.user.id,
    session.user.role,
    parsed.data.credentialId,
  );
  if (!credential) {
    return NextResponse.json({ error: "Credential not found" }, { status: 404 });
  }

  const search = parsed.data.search;
  if (!search) return NextResponse.json({ staff: [] });

  const staff = await prisma.user.findMany({
    where: {
      organizationId: credential.organizationId,
      role: "staff",
      OR: [
        { email: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    },
    select: { email: true, name: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 8,
  });

  return NextResponse.json({ staff });
}
