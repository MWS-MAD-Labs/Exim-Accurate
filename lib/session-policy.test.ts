import assert from "node:assert/strict";
import test from "node:test";
import { endsSessions } from "./session-policy";

test("only taking all access away ends sessions", () => {
  assert.equal(endsSessions(["store.use"], []), true);
  assert.equal(endsSessions(["store.use", "pos.checkout"], ["store.use"]), false);
  assert.equal(endsSessions(["store.use"], ["pos.checkout"]), false);
  assert.equal(endsSessions([], []), false);
  assert.equal(endsSessions([], ["store.use"]), false);
});
