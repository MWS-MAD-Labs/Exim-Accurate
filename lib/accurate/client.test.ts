import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { ACCURATE_REQUEST_TIMEOUT_MS, fetchWithTimeout } from "./client";

function stalledFetch(t: TestContext) {
  const original = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      signal = init?.signal;
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  t.after(() => {
    globalThis.fetch = original;
  });
  return () => signal;
}

test("a request that never answers fails with a message the sale retry recognizes, instead of waiting for ever", async (t) => {
  const signal = stalledFetch(t);
  // The timer of AbortSignal.timeout does not keep the process alive. A server has other work; this test has none, so it holds the
  // process open itself until the timeout has fired.
  const keepAlive = setInterval(() => {}, 1000);
  t.after(() => clearInterval(keepAlive));

  await assert.rejects(fetchWithTimeout("https://example.accurate.test/x", {}, 20), (error: Error) => {
    assert.match(error.message, /timed out/i);
    return true;
  });
  assert.ok(signal());
});

test("an answer inside the limit is returned as it is", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  t.after(() => {
    globalThis.fetch = original;
  });

  const response = await fetchWithTimeout("https://example.accurate.test/x");

  assert.equal(response.status, 200);
});

test("other failures are not turned into timeouts", async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  t.after(() => {
    globalThis.fetch = original;
  });

  await assert.rejects(fetchWithTimeout("https://example.accurate.test/x"), /fetch failed/);
});

test("the limit is shorter than the 120 seconds the scheduler waits", () => {
  assert.ok(ACCURATE_REQUEST_TIMEOUT_MS * 3 < 120_000 + ACCURATE_REQUEST_TIMEOUT_MS);
  assert.ok(ACCURATE_REQUEST_TIMEOUT_MS <= 60_000);
});
