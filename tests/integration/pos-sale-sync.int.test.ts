import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { BUSY, SYNC_BUDGET_MS, retryPendingPosSales, retryPosSaleNow, runPosSaleSync } from "@/lib/pos-sale-sync";
import { TEST_ORG, clean, requireDatabase } from "./support";

type Reply = (url: string, init?: RequestInit) => Promise<Response> | Response;

describe("sending the pending sales to Accurate", () => {
  let credentialId = "";
  let userId = "";
  const realFetch = globalThis.fetch;

  async function removeAll() {
    const mine = { credential: { organization: { centralOrganizationId: TEST_ORG } } };
    await prisma.posSale.deleteMany({ where: mine });
    await prisma.accurateCredentials.deleteMany({ where: { organization: { centralOrganizationId: TEST_ORG } } });
    await clean();
  }

  // Accurate, as the sync sees it: nothing recorded yet, and a new adjustment gets the id 900.
  const accurate: Reply = (url, init) => {
    if (init?.method === "POST") return new Response(JSON.stringify({ s: true, r: { id: 900 }, d: [] }), { status: 200 });
    return new Response(JSON.stringify({ s: true, d: [], sp: { page: 1, pageSize: 100, pageCount: 1 } }), { status: 200 });
  };
  const useAccurate = (reply: Reply) => {
    globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => Promise.resolve(reply(String(input), init))) as typeof fetch;
  };

  const sale = (over: Record<string, unknown> = {}) =>
    prisma.posSale.create({
      data: {
        userId,
        credentialId,
        idempotencyKey: `k-${Math.random()}`,
        requestFingerprint: "f",
        warehouseId: 1,
        warehouseName: "Main Warehouse",
        paymentMethod: "cash",
        items: { create: [{ itemCode: "ITEM-1", itemName: "Item", quantity: 1, unitPrice: 1000, unitCost: 800 }] },
        ...over,
      },
    });
  const reload = (id: string) => prisma.posSale.findUniqueOrThrow({ where: { id } });

  before(requireDatabase);
  beforeEach(async () => {
    await removeAll();
    const organizationId = (await prisma.organization.create({ data: { name: "TEST Exima", centralOrganizationId: TEST_ORG } })).id;
    userId = (await prisma.user.create({ data: { organizationId, email: "test_cashier@millennia21.id", name: "Cashier", role: "admin" } })).id;
    credentialId = (await prisma.accurateCredentials.create({
      data: { organizationId, userId, appKey: "k", signatureSecret: "s", apiToken: "t", host: "https://example.accurate.test", session: "session" },
    })).id;
  });
  afterEach(async () => {
    globalThis.fetch = realFetch;
    await removeAll();
  });
  after(() => prisma.$disconnect());

  it("records a pending sale in Accurate and marks it synced", async () => {
    useAccurate(accurate);
    const pending = await sale();

    const run = await retryPendingPosSales();

    assert.notEqual(run, BUSY);
    assert.deepEqual(run === BUSY ? null : [run.attempted, run.synced, run.failed], [1, 1, 0]);
    const done = await reload(pending.id);
    assert.equal(done.status, "synced");
    assert.equal(done.accurateId, 900);
    assert.equal(done.nextSyncAttemptAt, null);
  });

  it("keeps a sale that Accurate refused as an error with a backoff, and does not try it again before that", async () => {
    useAccurate(() => new Response("down", { status: 400 }));
    const pending = await sale();

    await retryPendingPosSales();
    const failed = await reload(pending.id);
    assert.equal(failed.status, "sync_error");
    assert.equal(failed.syncAttempts, 1);
    assert.ok(failed.syncError);
    assert.ok(failed.nextSyncAttemptAt && failed.nextSyncAttemptAt.getTime() > Date.now());

    useAccurate(accurate);
    const again = await retryPendingPosSales();
    assert.equal(again === BUSY ? -1 : again.attempted, 0);
  });

  it("lets a failed sale go at once when retried now, and leaves the others alone", async () => {
    const failed = await sale({ status: "sync_error", nextSyncAttemptAt: new Date(Date.now() + 3_600_000), syncAttempts: 3 });
    const waiting = await sale({ nextSyncAttemptAt: new Date(Date.now() + 60_000) });
    const synced = await sale({ status: "synced", accurateId: 1 });

    assert.equal(await retryPosSaleNow(failed.id), "queued");
    assert.equal(await retryPosSaleNow(waiting.id), "not_in_error");
    assert.equal(await retryPosSaleNow(synced.id), "not_in_error");

    assert.equal((await reload(failed.id)).nextSyncAttemptAt, null);
    assert.ok((await reload(waiting.id)).nextSyncAttemptAt);
    useAccurate(accurate);
    const run = await retryPendingPosSales();
    assert.equal(run === BUSY ? -1 : run.synced, 1);
    assert.equal((await reload(failed.id)).status, "synced");
  });

  it("stops starting sales once the time of the run is used, and leaves the rest for the next run", async () => {
    useAccurate(accurate);
    const first = await sale();
    const second = await sale();
    const third = await sale();
    // Each reading of the clock is 20 seconds later: there is room for one sale, not for a second.
    let clock = 0;

    const run = await runPosSaleSync(() => (clock += 20_000));

    assert.ok(SYNC_BUDGET_MS > 60_000);
    assert.equal(run.attempted, 1);
    assert.equal((await reload(first.id)).status, "synced");
    assert.equal((await reload(second.id)).status, "pending_sync");
    assert.equal((await reload(third.id)).status, "pending_sync");
  });

  it("does not start a second run while one is waiting for Accurate", async () => {
    let release: () => void = () => {};
    useAccurate(
      (url, init) =>
        new Promise<Response>((resolve) => {
          release = () => resolve(accurate(url, init));
        }) as unknown as Response,
    );
    await sale();

    const first = retryPendingPosSales();
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = await retryPendingPosSales();
    assert.equal(second, BUSY);

    useAccurate(accurate);
    release();
    await first;
  });
});
