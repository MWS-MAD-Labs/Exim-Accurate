import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session";
import { hasPermission } from "@/lib/access-control";
import { badgeSecretConfigured, issueBadgeToken } from "@/lib/badge-token";
import { prisma } from "@/lib/prisma";

// The badge of the person who is signed in, to show on a phone at the kiosk.
export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasPermission(session.user.permissions, "store.use")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!badgeSecretConfigured()) {
    return NextResponse.json({ error: "Badges are not set up yet. Ask an admin." }, { status: 503 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, centralPersonId: true, badgeVersion: true },
  });
  if (!user?.centralPersonId) return NextResponse.json({ error: "This account has no Central identity" }, { status: 409 });

  return NextResponse.json(
    { name: user.name ?? user.email, token: issueBadgeToken(user.centralPersonId, user.badgeVersion) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
