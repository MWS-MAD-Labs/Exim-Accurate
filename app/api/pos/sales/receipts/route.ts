import { after, NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { getOperationalPosCredential } from "@/lib/credential-access";
import { retryPosSaleReceipts } from "@/lib/pos-sale-receipt";
import { isAdmin } from "@/lib/pos-server";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  credentialId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid query" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  const deliveries = await prisma.posSale.findMany({
    where: {
      credentialId: parsed.data.credentialId,
      receiptEmailStatus: { in: ["pending", "processing", "failed", "disabled"] },
    },
    select: {
      id: true,
      staffEmail: true,
      staffName: true,
      createdAt: true,
      receiptEmailStatus: true,
      receiptEmailAttemptedAt: true,
      receiptEmailError: true,
    },
    orderBy: { receiptEmailAttemptedAt: "desc" },
    take: parsed.data.limit,
  });
  return NextResponse.json(deliveries);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const parsed = querySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid request" }, { status: 400 });
  const credential = await getOperationalPosCredential(session.user.id, session.user.role, parsed.data.credentialId);
  if (!credential) return NextResponse.json({ error: "Credential not found" }, { status: 404 });

  after(async () => {
    try {
      const result = await retryPosSaleReceipts(parsed.data);
      if (result.failed > 0) console.error("[pos-sale-receipt] Retry run completed with failures", result);
      else console.info("[pos-sale-receipt] Retry run completed", result);
    } catch (error) {
      console.error("[pos-sale-receipt] Fatal retry run error", error);
    }
  });
  return NextResponse.json({ success: true, message: "Receipt retry run triggered", triggeredAt: new Date().toISOString() }, { status: 202 });
}
