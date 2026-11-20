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
// A short process-local pause prevents a provider-wide failure from consuming every worker run.
export const PROVIDER_OUTAGE_COOLDOWN_MS = 60_000;

type SyncCandidate = { status: string };

// New sales and retries alternate while both queues have work, preventing either class from starving.
export function fairSyncCandidates<T extends SyncCandidate>(candidates: T[], take = SYNC_BATCH): T[] {
  const pending = candidates.filter((sale) => sale.status === "pending_sync");
  const retries = candidates.filter((sale) => sale.status === "sync_error");
  const queue: T[] = [];
  for (let index = 0; queue.length < take && (index < pending.length || index < retries.length); index += 1) {
    if (index < pending.length && queue.length < take) queue.push(pending[index]);
    if (index < retries.length && queue.length < take) queue.push(retries[index]);
  }
  return queue;
}

// Accurate reports these provider-wide/transient conditions in its thrown messages.
export function isProviderOutageError(error: unknown): boolean {
  return error instanceof Error && /status (429|500|503)\b|timed? out|timeout/i.test(error.message);
}

export class ProviderCooldowns {
  private readonly untilByCredential = new Map<string, number>();

  recordOutage(credentialId: string, now: number): void {
    this.untilByCredential.set(credentialId, now + PROVIDER_OUTAGE_COOLDOWN_MS);
  }

  isCoolingDown(credentialId: string, now: number): boolean {
    const until = this.untilByCredential.get(credentialId);
    if (until === undefined) return false;
    if (now < until) return true;
    this.untilByCredential.delete(credentialId);
    return false;
  }
}

const providerCooldowns = new ProviderCooldowns();

// Minutes to wait after the nth failed attempt: 10, 20, 40, then every 60.
export const retryDelayMinutes = (attempts: number) => Math.min(60, 5 * 2 ** Math.min(attempts, 4));

// Whether another sale may still be started in a run that began at `startedAt`.
export const hasTimeForSale = (startedAt: number, now: number, budgetMs = SYNC_BUDGET_MS, saleMs = SYNC_SALE_ALLOWANCE_MS) =>
  startedAt + budgetMs - now >= saleMs;

export type SyncRun = { attempted: number; synced: number; failed: number; syncedIds: string[] };

// One run, with the clock it reads given, so a test can move time.
export async function runPosSaleSync(now: () => number): Promise<SyncRun> {
  const startedAt = now();
  const candidates = await Promise.all([
    prisma.posSale.findMany({
      where: { status: "pending_sync", OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: new Date() } }] },
      include: { items: true, credential: true },
      orderBy: { createdAt: "asc" },
      take: SYNC_BATCH,
    }),
    prisma.posSale.findMany({
      where: { status: "sync_error", OR: [{ nextSyncAttemptAt: null }, { nextSyncAttemptAt: { lte: new Date() } }] },
      include: { items: true, credential: true },
      orderBy: { createdAt: "asc" },
      take: SYNC_BATCH,
    }),
  ]);
  const queue = fairSyncCandidates([...candidates[0], ...candidates[1]], SYNC_BATCH);

  const run: SyncRun = { attempted: 0, synced: 0, failed: 0, syncedIds: [] };
  for (const sale of queue) {
    // What is left of the budget goes to the sales not yet started; those wait for the next run.
    if (!hasTimeForSale(startedAt, now())) break;
    const attemptAt = new Date();
    // The cooldown is intentionally checked before claiming, so skipped sales remain eligible after it expires.
    if (providerCooldowns.isCoolingDown(sale.credentialId, attemptAt.getTime())) continue;
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
      if (isProviderOutageError(error)) providerCooldowns.recordOutage(sale.credentialId, now());
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
