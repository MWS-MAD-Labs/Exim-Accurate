import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrganizationIdForUser } from "@/lib/organization";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const role = session.user.role;
  if (!["admin", "cashier", "staff", "resource"].includes(role)) {
    return NextResponse.json([]);
  }

  const organizationId = await getOrganizationIdForUser(session.user.id);
  if (!organizationId) {
    return NextResponse.json({ error: "Organisasi pengguna tidak ditemukan" }, { status: 403 });
  }

  const credentials = await prisma.accurateCredentials.findMany({
    where:
      role === "admin"
        ? { organizationId }
        : role === "resource"
          ? { organizationId, disconnectedAt: null }
          : { organizationId, disconnectedAt: null, posSettings: { is: { isActive: true } } },
    select: {
      id: true,
      appKey: true,
      host: true,
      disconnectedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(credentials);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "Akses admin diperlukan" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID wajib diisi" }, { status: 400 });
  }

  try {
    const organizationId = await getOrganizationIdForUser(session.user.id);
    if (!organizationId) {
      return NextResponse.json({ error: "Organisasi pengguna tidak ditemukan" }, { status: 403 });
    }

    const credential = await prisma.accurateCredentials.findFirst({
      where: { id, organizationId },
      select: { id: true, disconnectedAt: true },
    });
    if (!credential) {
      return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 404 });
    }

    if (credential.disconnectedAt) {
      await prisma.accurateCredentials.delete({ where: { id } });
    } else {
      await prisma.accurateCredentials.update({
        where: { id },
        data: {
          host: null,
          session: null,
          refreshToken: null,
          disconnectedAt: new Date(),
        },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[credentials] Failed to delete credential", error);
    return NextResponse.json(
      { error: "Gagal menghapus kredensial beserta data terkait" },
      { status: 500 },
    );
  }
}
