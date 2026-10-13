import assert from "node:assert/strict";
import test from "node:test";
import { isSignInPath, sessionRevoked } from "./session-recheck";

test("a session with a user but no id is revoked", () => {
  assert.equal(sessionRevoked({ user: { id: "" } }), true);
  assert.equal(sessionRevoked({ user: {} }), true);
});

test("a normal session, or none at all, is not revoked", () => {
  assert.equal(sessionRevoked({ user: { id: "u1" } }), false);
  assert.equal(sessionRevoked({}), false);
  assert.equal(sessionRevoked(null), false);
});

test("the sign-in pages are left alone while the new session is being made", () => {
  assert.equal(isSignInPath("/auth/sso/continue"), true);
  assert.equal(isSignInPath("/login"), true);
  assert.equal(isSignInPath("/dashboard"), false);
  assert.equal(isSignInPath(null), false);
});
