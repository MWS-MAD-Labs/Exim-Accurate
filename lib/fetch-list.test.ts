import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { fetchList } from "./fetch-list";

const original = globalThis.fetch;
const quiet = console.warn;

function reply(body: unknown, status = 200) {
  globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = original;
  console.warn = quiet;
});

test("a list comes back as it is", async () => {
  reply([{ id: "a" }]);
  assert.deepEqual(await fetchList("/api/credentials"), [{ id: "a" }]);
});

test("an error body is never handed over as a list", async () => {
  console.warn = () => undefined;
  reply({ error: "Organisasi pengguna tidak ditemukan" }, 403);
  assert.deepEqual(await fetchList("/api/credentials"), []);
  reply({ error: "oops" }, 200);
  assert.deepEqual(await fetchList("/api/credentials"), []);
});

test("a reply that is not JSON, or no reply, gives an empty list", async () => {
  console.warn = () => undefined;
  globalThis.fetch = (async () => new Response("<html>", { status: 502 })) as typeof fetch;
  assert.deepEqual(await fetchList("/api/credentials"), []);
  globalThis.fetch = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  assert.deepEqual(await fetchList("/api/credentials"), []);
});

test("a signed-out visitor is sent to the sign-in page", async () => {
  const location = { pathname: "/pos-cashier", search: "?x=1", href: "" };
  (globalThis as { window?: unknown }).window = { location };
  try {
    reply({ error: "Unauthorized" }, 401);
    assert.deepEqual(await fetchList("/api/credentials"), []);
    assert.equal(location.href, "/login?callbackUrl=%2Fpos-cashier%3Fx%3D1");
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});
