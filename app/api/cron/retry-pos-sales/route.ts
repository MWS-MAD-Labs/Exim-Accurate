import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncPosSale } from "@/lib/accurate/pos";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await prisma.posSale.findMany({
    where: {
      status: { in: ["pending_sync", "sync_error"] },
      OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: new Date() } }],
    },
    include: { items: true, credential: true },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  let synced = 0;
  let failed = 0;
  for (const sale of candidates) {
    const attemptAt = new Date();
    await prisma.posSale.updateMany({
      where: { id: sale.id, status: { in: ["pending_sync", "sync_error"] } },
      data: { syncAttempts: { increment: 1 }, lastSyncAttemptAt: attemptAt, nextSyncAttemptAt: null },
    });

    if (!sale.credential.host || !sale.credential.session) {
      failed += 1;
      await prisma.posSale.update({
        where: { id: sale.id },
        data: {
          status: "sync_error",
          syncError: "Accurate session is not ready",
          nextSyncAttemptAt: new Date(attemptAt.getTime() + 5 * 60 * 1000),
        },
      });
      continue;
    }

    try {
      const adjustment = await syncPosSale(
        {
          apiToken: sale.credential.apiToken,
          signatureSecret: sale.credential.signatureSecret,
          host: sale.credential.host,
          session: sale.credential.session,
        },
        sale,
      );
      await prisma.posSale.update({
        where: { id: sale.id },
        data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null, nextSyncAttemptAt: null },
      });
      synced += 1;
    } catch (error) {
      failed += 1;
      const syncError = error instanceof Error ? error.message : "Unknown Accurate synchronization error";
      const delayMinutes = Math.min(60, 5 * 2 ** Math.min(sale.syncAttempts, 4));
      await prisma.posSale.update({
        where: { id: sale.id },
        data: { status: "sync_error", syncError, nextSyncAttemptAt: new Date(attemptAt.getTime() + delayMinutes * 60 * 1000) },
      });
    }
  }

  return NextResponse.json({ attempted: candidates.length, synced, failed });
}
