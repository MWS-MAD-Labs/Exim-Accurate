import assert from "node:assert/strict";
import test from "node:test";
import { healthBody } from "./health";

test("the health answer carries the version the image was built from", () => {
  assert.deepEqual(healthBody({ APP_VERSION: " abc123 " }), { status: "ok", version: "abc123" });
});

test("without a version it says unknown, so a deploy never matches by accident", () => {
  assert.deepEqual(healthBody({}), { status: "ok", version: "unknown" });
  assert.deepEqual(healthBody({ APP_VERSION: "" }), { status: "ok", version: "unknown" });
});
