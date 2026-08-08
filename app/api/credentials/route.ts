import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });
  }

  const role = session.user.role;
  if (!["admin", "cashier", "staff", "resource"].includes(role)) {
    return NextResponse.json([]);
  }

  const credentials = await prisma.accurateCredentials.findMany({
    where:
      role === "admin"
        ? undefined
        : role === "resource"
          ? { disconnectedAt: null }
          : { disconnectedAt: null, posSettings: { is: { isActive: true } } },
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
    const credential = await prisma.accurateCredentials.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!credential) {
      return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 404 });
    }

    await prisma.accurateCredentials.update({
      where: { id },
      data: {
        host: null,
        session: null,
        refreshToken: null,
        disconnectedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[credentials] Failed to delete credential", error);
    return NextResponse.json(
      { error: "Gagal menghapus kredensial beserta data terkait" },
      { status: 500 },
    );
  }
}
