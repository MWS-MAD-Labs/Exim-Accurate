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
  assert.match(requests[0]?.url || "", /filter\.description/);
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
