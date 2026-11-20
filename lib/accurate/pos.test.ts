import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { buildPosSaleAdjustmentPayload, syncPosSale } from "./pos";

const testCredentials = {
  apiToken: "test-token",
  signatureSecret: "test-secret",
  host: "https://example.accurate.test",
  session: "test-session",
};

function mockFetch(t: TestContext, handler: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
}

test("delayed POS synchronization uses the persisted Jakarta purchase date", () => {
  const payload = buildPosSaleAdjustmentPayload({
    id: "sale-1",
    createdAt: new Date("2026-09-15T16:59:00.000Z"),
    warehouseName: "Main Warehouse",
    items: [{ itemCode: "ITEM-1", quantity: 2, unitCost: 1500 }],
  });

  assert.equal(payload.transDate, "2026-09-15");
  assert.equal(payload.description, "POS Sale sale-1");
  assert.deepEqual(payload.detailItem, [{
    itemNo: "ITEM-1",
    quantity: 2,
    itemAdjustmentType: "ADJUSTMENT_OUT",
    unitCost: 1500,
    warehouseName: "Main Warehouse",
  }]);
});

test("retry finds a legacy UTC-dated adjustment by exact sale description before submitting", async (t) => {
  const requests: Array<{ url: string; method: string }> = [];
  mockFetch(t, async (input, init) => {
    const url = String(input);
    requests.push({ url, method: init?.method || "GET" });
    const page = new URL(url).searchParams.get("sp.page");
    return new Response(JSON.stringify(page === "1" ? {
      d: [{
        id: 700,
        transDate: "2026-09-15",
        number: "IA.2026.00700",
        description: "POS Sale sale-legacy manual correction",
      }],
      sp: { page: 1, pageSize: 100, pageCount: 2 },
    } : {
      d: [{
        id: 731,
        transDate: "2026-09-15",
        number: "IA.2026.00731",
        description: "POS Sale sale-legacy",
      }],
      sp: { page: 2, pageSize: 100, pageCount: 2 },
    }), { status: 200 });
  });

  const result = await syncPosSale(testCredentials, {
    id: "sale-legacy",
    createdAt: new Date("2026-09-15T18:30:00.000Z"),
    warehouseName: "Main Warehouse",
    items: [{ itemCode: "ITEM-1", quantity: 2, unitCost: 1500 }],
  });

  assert.deepEqual(result, { id: 731, number: "IA.2026.00731" });
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.method, "GET");
  assert.match(requests[0]?.url || "", /filter\.keywords/);
  assert.doesNotMatch(requests[0]?.url || "", /filter\.description/);
  assert.doesNotMatch(requests[0]?.url || "", /filter\.transDate/);
});

test("Jakarta purchase date can differ from UTC without following worker execution time", () => {
  const payload = buildPosSaleAdjustmentPayload({
    id: "sale-2",
    createdAt: new Date("2026-09-15T18:30:00.000Z"),
    warehouseName: "Main Warehouse",
    items: [{ itemCode: "ITEM-2", quantity: 1 }],
  });

  assert.equal(payload.transDate, "2026-09-16");
});

test("a search by description that is not narrowed stops after a few pages instead of walking the whole history", async (t) => {
  let requests = 0;
  mockFetch(t, async () => {
    requests += 1;
    return new Response(JSON.stringify({
      d: [{ id: requests, transDate: "2026-09-15", number: `IA.${requests}`, description: "POS Sale another" }],
      sp: { page: requests, pageSize: 100, pageCount: 500 },
    }), { status: 200 });
  });

  await assert.rejects(
    syncPosSale(testCredentials, { id: "sale-x", createdAt: new Date("2026-09-15T05:00:00.000Z"), warehouseName: "Main Warehouse", items: [{ itemCode: "ITEM-1", quantity: 1, unitCost: 1000 }] }),
    /too many adjustments/,
  );
  // Three pages for each of the three attempts at most, never the 500 pages.
  assert.ok(requests <= 9, `asked ${requests} times`);
});

test("missing sale ignores VOID matches and creates one adjustment", async (t) => {
  let saves = 0;
  mockFetch(t, async (_input, init) => {
    if (init?.method === "POST") {
      saves += 1;
      const body = JSON.parse(String(init.body));
      assert.equal(body.description, "POS Sale sale-new");
      return Response.json({ s: true, r: { id: 900, number: "IA.900" } });
    }
    return Response.json({ s: true, d: [{ id: 899, description: "VOID POS Sale sale-new" }], sp: { pageCount: 1 } });
  });
  assert.deepEqual(await syncPosSale(testCredentials, {
    id: "sale-new", createdAt: new Date("2026-11-20T01:00:00Z"), warehouseName: "Main",
    items: [{ itemCode: "ITEM-1", quantity: 1, unitCost: 1000 }],
  }), { id: 900, number: "IA.900" });
  assert.equal(saves, 1);
});

test("provider 503 is retried with duplicate lookup before any save", async (t) => {
  let reads = 0;
  mockFetch(t, async (_input, init) => {
    assert.notEqual(init?.method, "POST");
    reads += 1;
    if (reads === 1) return new Response("Unavailable", { status: 503 });
    return Response.json({ s: true, d: [{ id: 901, number: "IA.901", description: "POS Sale sale-retry" }], sp: { pageCount: 1 } });
  });
  assert.deepEqual(await syncPosSale(testCredentials, {
    id: "sale-retry", createdAt: new Date("2026-11-20T01:00:00Z"), warehouseName: "Main",
    items: [{ itemCode: "ITEM-1", quantity: 1, unitCost: 1000 }],
  }), { id: 901, number: "IA.901" });
  assert.equal(reads, 2);
});
