import assert from "node:assert/strict";
import test from "node:test";
import { sessionRevoked } from "./session-recheck";

test("an authenticated session with no id is revoked on an app page", () => {
  assert.equal(sessionRevoked("authenticated", "", "/dashboard"), true);
  assert.equal(sessionRevoked("authenticated", undefined, "/store"), true);
});

test("the sign-in pages are left alone while the new session is being made", () => {
  assert.equal(sessionRevoked("authenticated", "", "/auth/sso/continue"), false);
  assert.equal(sessionRevoked("authenticated", "", "/login"), false);
});

test("a normal or missing session is not revoked", () => {
  assert.equal(sessionRevoked("authenticated", "u1", "/dashboard"), false);
  assert.equal(sessionRevoked("unauthenticated", undefined, "/dashboard"), false);
  assert.equal(sessionRevoked("loading", undefined, "/dashboard"), false);
});
