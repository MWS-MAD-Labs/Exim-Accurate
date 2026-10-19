import assert from "node:assert/strict";
import test from "node:test";
import { signInUrl } from "./sign-in-redirect";

test("the sign-in address carries the page to come back to", () => {
  assert.equal(signInUrl("/dashboard?tab=a b"), "/login?callbackUrl=%2Fdashboard%3Ftab%3Da%20b");
});
