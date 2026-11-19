import { syncPosSale } from "@/lib/accurate/pos";
import { ACCURATE_REQUEST_TIMEOUT_MS } from "@/lib/accurate/client";
import { prisma } from "@/lib/prisma";
import { BUSY, singleFlight } from "@/lib/single-flight";

export const SYNC_BATCH = 3;
// A run must answer well inside the 120 seconds the scheduler waits.
export const SYNC_BUDGET_MS = 90_000;
// One sale may use a few requests, each with its own limit, so a sale is only started when this much of the budget is left.
export const SYNC_SALE_ALLOWANCE_MS = ACCURATE_REQUEST_TIMEOUT_MS * 2;
export const SYNC_LEASE_MS = 5 * 60 * 1000;

// Minutes to wait after the nth failed attempt: 10, 20, 40, then every 60.
export const retryDelayMinutes = (attempts: number) => Math.min(60, 5 * 2 ** Math.min(attempts, 4));

// Whether another sale may still be started in a run that began at `startedAt`.
export const hasTimeForSale = (startedAt: number, now: number, budgetMs = SYNC_BUDGET_MS, saleMs = SYNC_SALE_ALLOWANCE_MS) =>
  startedAt + budgetMs - now >= saleMs;

export type SyncRun = { attempted: number; synced: number; failed: number; syncedIds: string[] };

// One run, with the clock it reads given, so a test can move time.
export async function runPosSaleSync(now: () => number): Promise<SyncRun> {
  const startedAt = now();
  const candidates = await prisma.posSale.findMany({
    where: {
      status: { in: ["pending_sync", "sync_error"] },
      OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: new Date() } }],
    },
    include: { items: true, credential: true },
    orderBy: { createdAt: "asc" },
    take: SYNC_BATCH,
  });

  const run: SyncRun = { attempted: 0, synced: 0, failed: 0, syncedIds: [] };
  for (const sale of candidates) {
    // What is left of the budget goes to the sales not yet started; those wait for the next run.
    if (!hasTimeForSale(startedAt, now())) break;
    const attemptAt = new Date();
    const claim = await prisma.posSale.updateMany({
      where: {
        id: sale.id,
        status: { in: ["pending_sync", "sync_error"] },
        OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: attemptAt } }],
      },
      data: { syncAttempts: { increment: 1 }, lastSyncAttemptAt: attemptAt, nextSyncAttemptAt: new Date(attemptAt.getTime() + SYNC_LEASE_MS) },
    });
    if (claim.count !== 1) continue;
    run.attempted += 1;

    if (!sale.credential.host || !sale.credential.session) {
      run.failed += 1;
      await prisma.posSale.update({
        where: { id: sale.id },
        data: { status: "sync_error", syncError: "Accurate session is not ready", nextSyncAttemptAt: new Date(attemptAt.getTime() + SYNC_LEASE_MS) },
      });
      continue;
    }

    try {
      const adjustment = await syncPosSale(
        { apiToken: sale.credential.apiToken, signatureSecret: sale.credential.signatureSecret, host: sale.credential.host, session: sale.credential.session },
        sale,
      );
      await prisma.posSale.update({
        where: { id: sale.id },
        data: { status: "synced", accurateId: adjustment.id, syncedAt: new Date(), syncError: null, nextSyncAttemptAt: null },
      });
      run.synced += 1;
      run.syncedIds.push(sale.id);
    } catch (error) {
      run.failed += 1;
      const syncError = error instanceof Error ? error.message : "Unknown Accurate synchronization error";
      await prisma.posSale.update({
        where: { id: sale.id },
        data: { status: "sync_error", syncError, nextSyncAttemptAt: new Date(attemptAt.getTime() + retryDelayMinutes(sale.syncAttempts) * 60 * 1000) },
      });
    }
  }
  return run;
}

// One run of the retry of pending sales at a time in this process, so a slow Accurate cannot pile up a run every minute. A call
// made while a run is going gets BUSY back at once.
export const retryPendingPosSales = singleFlight(() => runPosSaleSync(Date.now), SYNC_BUDGET_MS * 2);
export { BUSY };

// A sale that failed waits for its backoff; "retry now" lets the next run take it at once. A sale that is not in error is
// either waiting for its first run or being sent right now, and is left alone.
export async function retryPosSaleNow(saleId: string): Promise<"queued" | "not_in_error"> {
  const result = await prisma.posSale.updateMany({ where: { id: saleId, status: "sync_error" }, data: { nextSyncAttemptAt: null } });
  return result.count === 1 ? "queued" : "not_in_error";
}
