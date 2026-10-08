import assert from "node:assert/strict";
import test from "node:test";
import { ssoCallbackAction } from "./sso-callback";

test("a callback that Exima started continues", () => {
  assert.equal(ssoCallbackAction({ code: "c", state: "n", nonce: "n" }), "continue");
});

test("a launch from Hub, with no state and no cookie, restarts through Exima", () => {
  assert.equal(ssoCallbackAction({ code: "c", state: null, nonce: undefined }), "restart");
});

test("a mismatched or half-present state is rejected", () => {
  assert.equal(ssoCallbackAction({ code: "c", state: "a", nonce: "b" }), "reject");
  assert.equal(ssoCallbackAction({ code: "c", state: "a", nonce: undefined }), "reject");
  assert.equal(ssoCallbackAction({ code: "c", state: null, nonce: "b" }), "reject");
  assert.equal(ssoCallbackAction({ code: null, state: "n", nonce: "n" }), "reject");
});
