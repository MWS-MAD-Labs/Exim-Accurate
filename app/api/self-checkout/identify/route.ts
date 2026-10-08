import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getResourceCredential } from "@/lib/credential-access";
import { prisma } from "@/lib/prisma";
import { resolveBadgeWithCentral } from "@/lib/central-provision";

const bodySchema = z.object({
  credentialId: z.string().uuid(),
  value: z.string().trim().min(1).max(254),
});

// Turns what a badge reader typed into the staff member it belongs to. The kiosk shows the
// name from here and sends the email from here, so who is buying is decided on the server.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Tidak diizinkan" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Data badge tidak valid" }, { status: 400 });

  const credential = await getResourceCredential(session.user.id, session.user.permissions, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Kredensial tidak ditemukan" }, { status: 404 });

  const badge = await resolveBadgeWithCentral(parsed.data.value);
  if (!badge.ok) {
    return NextResponse.json(
      {
        code: badge.reason === "revoked" ? "BADGE_REVOKED" : "BADGE_UNKNOWN",
        error: badge.reason === "revoked"
          ? "Badge sudah dicabut, ambil badge baru di halaman staf."
          : "Badge tidak dikenali sebagai staf Exima.",
      },
      { status: 404 },
    );
  }

  // The person has to belong to the organization of the credential.
  const member = await prisma.user.findFirst({
    where: { centralPersonId: badge.personId, organizationId: credential.organizationId },
    select: { id: true },
  });
  if (!member) return NextResponse.json({ code: "BADGE_UNKNOWN", error: "Badge tidak dikenali sebagai staf Exima." }, { status: 404 });

  if (badge.via === "email") {
    console.info("[badge] A card with the email was used, it should move to a signed badge", { personId: badge.personId });
  }
  return NextResponse.json({ personId: badge.personId, email: badge.email, name: badge.name, via: badge.via });
}
