import assert from "node:assert/strict";
import test from "node:test";
import { createIdempotencyKey } from "./browser-id";

test("uses randomUUID when the browser provides it", () => {
  assert.equal(
    createIdempotencyKey({ randomUUID: () => "browser-generated-id" }),
    "browser-generated-id",
  );
});

test("creates an RFC 4122-shaped identifier from getRandomValues", () => {
  const id = createIdempotencyKey({
    getRandomValues: (array) => {
      array.set(Array.from({ length: 16 }, (_, index) => index));
      return array;
    },
  });

  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("returns a sufficiently long fallback without Web Crypto", () => {
  assert.ok(createIdempotencyKey({}).length >= 8);
});
