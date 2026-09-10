import assert from "node:assert/strict";
import test from "node:test";
import { MissingItemCostError, validateInventoryAdjustmentCosts } from "./accurate/inventory";
import {
  submitSelfCheckoutAdjustment,
  type ResolvedCheckoutItem,
  type SelfCheckoutItem,
} from "./self-checkout-submit";

function resolveWithCatalog(
  catalog: Record<string, { itemName: string; unitCost: number }>,
) {
  return async (items: SelfCheckoutItem[]): Promise<ResolvedCheckoutItem[]> => {
    const costs = validateInventoryAdjustmentCosts(items.map((item) => ({
      itemNo: item.itemCode,
      itemName: catalog[item.itemCode]?.itemName || item.itemName,
      unitCost: catalog[item.itemCode]?.unitCost ?? Number.NaN,
    })));

    return items.map((item) => ({
      ...item,
      itemName: catalog[item.itemCode]?.itemName || item.itemName,
      unitCost: costs.get(item.itemCode)!,
    }));
  };
}

function submissionDefaults(items: SelfCheckoutItem[]) {
  const failed: Array<{ sessionId: string; errorMessage: string }> = [];
  const completed: Array<{ sessionId: string; adjustmentId: number }> = [];
  let saveCalls = 0;

  return {
    failed,
    completed,
    get saveCalls() { return saveCalls; },
    options: {
      items,
      createSession: async () => ({ id: "session-1" }),
      resolveItems: resolveWithCatalog({}),
      saveAdjustment: async (_items: ResolvedCheckoutItem[]) => {
        saveCalls += 1;
        return { id: 42, r: "IA.42" };
      },
      completeSession: async (sessionId: string, result: { id: number }) => {
        completed.push({ sessionId, adjustmentId: result.id });
      },
      failSession: async (sessionId: string, errorMessage: string) => {
        failed.push({ sessionId, errorMessage });
      },
    },
  };
}

test("rejects a zero-cost item with a clear bilingual kiosk message", async () => {
  const state = submissionDefaults([{ itemCode: "ZERO", itemName: "Zero Item", quantity: 1 }]);
  state.options.resolveItems = resolveWithCatalog({ ZERO: { itemName: "Zero Item", unitCost: 0 } });

  await assert.rejects(
    submitSelfCheckoutAdjustment(state.options),
    (error: Error) => {
      assert.ok(error instanceof MissingItemCostError);
      assert.match(error.message, /Harga modal belum diatur untuk barang/);
      assert.match(error.message, /Purchase cost is not configured for item\(s\)/);
      assert.match(error.message, /Zero Item \(ZERO\)/);
      return true;
    },
  );

  assert.equal(state.saveCalls, 0);
  assert.equal(state.failed.length, 1);
  assert.match(state.failed[0].errorMessage, /Zero Item \(ZERO\)/);
});

test("rejects a mixed cart when one item has zero cost", async () => {
  const state = submissionDefaults([
    { itemCode: "VALID", itemName: "Valid Item", quantity: 2 },
    { itemCode: "ZERO", itemName: "Zero Item", quantity: 1 },
  ]);
  state.options.resolveItems = resolveWithCatalog({
    VALID: { itemName: "Valid Item", unitCost: 12500 },
    ZERO: { itemName: "Zero Item", unitCost: 0 },
  });

  await assert.rejects(submitSelfCheckoutAdjustment(state.options), /Zero Item \(ZERO\)/);

  assert.equal(state.saveCalls, 0);
  assert.equal(state.completed.length, 0);
  assert.equal(state.failed.length, 1);
});

test("submits and completes an adjustment when all item costs are valid", async () => {
  const state = submissionDefaults([
    { itemCode: "A", itemName: "Item A", quantity: 2 },
    { itemCode: "B", itemName: "Item B", quantity: 1 },
  ]);
  state.options.resolveItems = resolveWithCatalog({
    A: { itemName: "Item A", unitCost: 1000 },
    B: { itemName: "Item B", unitCost: 2500 },
  });
  let submittedItems: ResolvedCheckoutItem[] = [];
  state.options.saveAdjustment = async (items) => {
    submittedItems = items;
    return { id: 77, r: "IA.77" };
  };

  const submission = await submitSelfCheckoutAdjustment(state.options);

  assert.deepEqual(submittedItems.map(({ itemCode, unitCost }) => ({ itemCode, unitCost })), [
    { itemCode: "A", unitCost: 1000 },
    { itemCode: "B", unitCost: 2500 },
  ]);
  assert.deepEqual(submission, { sessionId: "session-1", result: { id: 77, r: "IA.77" } });
  assert.deepEqual(state.completed, [{ sessionId: "session-1", adjustmentId: 77 }]);
  assert.equal(state.failed.length, 0);
});

test("transitions a pending checkout session to failed when Accurate submission fails", async () => {
  const state = submissionDefaults([{ itemCode: "A", itemName: "Item A", quantity: 1 }]);
  state.options.resolveItems = resolveWithCatalog({ A: { itemName: "Item A", unitCost: 1000 } });
  state.options.saveAdjustment = async () => {
    throw new Error("Accurate rejected the adjustment");
  };

  await assert.rejects(
    submitSelfCheckoutAdjustment(state.options),
    /Accurate rejected the adjustment/,
  );

  assert.equal(state.completed.length, 0);
  assert.deepEqual(state.failed, [{
    sessionId: "session-1",
    errorMessage: "Accurate rejected the adjustment",
  }]);
});
