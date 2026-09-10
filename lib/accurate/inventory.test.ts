import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  MissingItemCostError,
  parseAccurateSaveResponse,
  resolveInventoryAdjustmentCosts,
} from "./inventory";

const testCredentials = {
  apiToken: "test-token",
  signatureSecret: "test-secret",
  host: "https://example.accurate.test",
  session: "test-session",
};

function mockItemListResponse(t: TestContext, item: object) {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({ d: [item] }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return () => requestedUrl;
}

test("parses current Accurate save responses returned under r", () => {
  const result = parseAccurateSaveResponse(
    {
      r: { id: 39000, name: "Cap Badak Strawberry" },
      d: ['Barang & Jasa "Cap Badak Strawberry" berhasil disimpan'],
    },
    "Unable to save item",
  );

  assert.deepEqual(result, { id: 39000, name: "Cap Badak Strawberry" });
});

test("parses legacy Accurate save responses returned under d", () => {
  const result = parseAccurateSaveResponse(
    { s: true, d: { id: 42, r: "IA.2026.00042" } },
    "Unable to save adjustment",
  );

  assert.deepEqual(result, { id: 42, r: "IA.2026.00042" });
});

test("throws Accurate validation messages from failed save responses", () => {
  assert.throws(
    () => parseAccurateSaveResponse({ s: false, d: ["Invalid warehouse"] }, "Save failed"),
    /Invalid warehouse/,
  );
});

test("uses vendorPrice as the inventory adjustment cost", async (t) => {
  const requestedUrl = mockItemListResponse(t, {
    no: "100336",
    name: "Kertas Samson",
    unitPrice: 0,
    vendorPrice: 1500,
    balanceUnitCost: 1631.578947,
    balanceTotalCost: 62000,
    cost: 0,
  });

  const costs = await resolveInventoryAdjustmentCosts(
    testCredentials,
    [{ itemNo: "100336", itemName: "Kertas Samson" }],
  );

  assert.equal(costs.get("100336"), 1500);
  assert.match(requestedUrl(), /fields=no,name,vendorPrice,balanceUnitCost/);
});

test("falls back to balanceUnitCost when vendorPrice is not positive", async (t) => {
  mockItemListResponse(t, {
    no: "100336",
    name: "Kertas Samson",
    vendorPrice: 0,
    balanceUnitCost: 1631.578947,
  });

  const costs = await resolveInventoryAdjustmentCosts(
    testCredentials,
    [{ itemNo: "100336" }],
  );

  assert.equal(costs.get("100336"), 1631.578947);
});

test("rejects an item when vendorPrice and balanceUnitCost are not positive", async (t) => {
  mockItemListResponse(t, {
    no: "100336",
    name: "Kertas Samson",
    vendorPrice: 0,
    balanceUnitCost: 0,
  });

  await assert.rejects(
    resolveInventoryAdjustmentCosts(testCredentials, [{ itemNo: "100336" }]),
    (error: Error) => {
      assert.ok(error instanceof MissingItemCostError);
      assert.match(error.message, /Kertas Samson \(100336\)/);
      return true;
    },
  );
});
