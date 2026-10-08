import assert from "node:assert/strict";
import test from "node:test";
import { clearProvisionMemoryForTest, provisionFromCentral } from "./central-provision";

test("values that cannot name a person are not sent to Central", async () => {
  clearProvisionMemoryForTest();
  assert.equal(await provisionFromCentral("12345"), false);
  assert.equal(await provisionFromCentral(""), false);
});

test("the same value is asked about once a minute", async () => {
  clearProvisionMemoryForTest();
  const saved = { base: process.env.CENTRAL_DATA_API_BASE_URL, token: process.env.CENTRAL_DATA_API_TOKEN };
  delete process.env.CENTRAL_DATA_API_BASE_URL;
  delete process.env.CENTRAL_DATA_API_TOKEN;
  const calls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: unknown) => {
    calls.push(String(url));
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    process.env.CENTRAL_DATA_API_BASE_URL = "http://central.test";
    process.env.CENTRAL_DATA_API_TOKEN = "t";
    const start = Date.now();
    assert.equal(await provisionFromCentral("new.person@x.id", start), false);
    assert.equal(await provisionFromCentral("new.person@x.id", start + 5_000), false);
    assert.equal(calls.length, 1);
    assert.equal(await provisionFromCentral("new.person@x.id", start + 61_000), false);
    assert.equal(calls.length, 2);
    assert.match(calls[0], /employees\/lookup\?email=new\.person%40x\.id/);
  } finally {
    globalThis.fetch = original;
    if (saved.base === undefined) delete process.env.CENTRAL_DATA_API_BASE_URL; else process.env.CENTRAL_DATA_API_BASE_URL = saved.base;
    if (saved.token === undefined) delete process.env.CENTRAL_DATA_API_TOKEN; else process.env.CENTRAL_DATA_API_TOKEN = saved.token;
  }
});
