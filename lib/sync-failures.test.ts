import assert from "node:assert/strict";
import test from "node:test";
import { createFailureTracker } from "./sync-failures";

test("a message is shown only after the failures last, and clears on success", () => {
  const tracker = createFailureTracker(3);
  assert.equal(tracker.fail("down"), null);
  assert.equal(tracker.fail("down"), null);
  assert.equal(tracker.fail("down"), "down");
  assert.equal(tracker.fail("down"), "down");
  tracker.succeed();
  assert.equal(tracker.count, 0);
  assert.equal(tracker.fail("down"), null);
});
