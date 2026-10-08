import assert from "node:assert/strict";
import test from "node:test";
import { withRetries } from "./retry";

const options = { retries: 3, waitMs: 1, sleep: async () => undefined };

test("a failure that can pass is asked again until it works", async () => {
  let calls = 0;
  const value = await withRetries(async () => { calls += 1; if (calls < 3) throw new Error("down"); return "ok"; }, { ...options, shouldRetry: () => true });
  assert.deepEqual([value, calls], ["ok", 3]);
});

test("it gives up after the retries, and at once for a failure that will not change", async () => {
  let calls = 0;
  await assert.rejects(withRetries(async () => { calls += 1; throw new Error("down"); }, { ...options, shouldRetry: () => true }), /down/);
  assert.equal(calls, 4);
  calls = 0;
  await assert.rejects(withRetries(async () => { calls += 1; throw new Error("no"); }, { ...options, shouldRetry: () => false }), /no/);
  assert.equal(calls, 1);
});
