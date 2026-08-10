import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isRoleAllowed } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";
import { expireReservations } from "@/lib/pos-server";
import { getOperationalPosCredential } from "@/lib/credential-access";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRoleAllowed(session.user.role, ["admin", "cashier", "staff"])) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const reservation = await prisma.posReservation.findUnique({
    where: { id },
    include: { items: true, sale: true },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
  }
  if (!reservation.credentialId) {
    return NextResponse.json({ error: "Reservation is not attached to a POS credential" }, { status: 409 });
  }

  const canReadAny = isRoleAllowed(session.user.role, ["admin", "cashier"]);
  if (!canReadAny && reservation.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (canReadAny && !await getOperationalPosCredential(session.user.id, session.user.role, reservation.credentialId)) {
    return NextResponse.json({ error: "Reservation is not available to this POS operator" }, { status: 403 });
  }

  await expireReservations(reservation.credentialId);
  const refreshed = await prisma.posReservation.findUnique({
    where: { id },
    include: { items: true, sale: true },
  });

  return NextResponse.json(refreshed);
}
