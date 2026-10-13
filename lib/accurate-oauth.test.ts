import assert from "node:assert/strict";
import test from "node:test";
import { checkRedirectUri } from "./accurate-oauth";

test("an address written without the slashes is refused with an example", () => {
  const result = checkRedirectUri("http:localhost:3000/accurate/callback", "http://localhost:3001");
  assert.match(result.error ?? "", /must start with http:\/\/ or https:\/\//);
  assert.match(result.error ?? "", /http:\/\/localhost:3001\/accurate\/callback/);
});

test("something that is not an address at all is refused", () => {
  assert.match(checkRedirectUri("localhost", "http://localhost:3001").error ?? "", /not an address|must start with/);
  assert.match(checkRedirectUri("", "http://localhost:3001").error ?? "", /not an address/);
});

test("the callback of this application passes", () => {
  assert.deepEqual(checkRedirectUri("http://localhost:3001/accurate/callback", "http://localhost:3001"), { error: null, warning: null });
  assert.deepEqual(checkRedirectUri("https://exima.mws.web.id/accurate/callback/", "https://exima.mws.web.id"), { error: null, warning: null });
});

test("another path is refused", () => {
  assert.match(checkRedirectUri("http://localhost:3001/auth/callback", "http://localhost:3001").error ?? "", /has to end in \/accurate\/callback/);
});

test("another host or port passes but is warned about, since the person would land on another application", () => {
  const result = checkRedirectUri("http://localhost:3000/accurate/callback", "http://localhost:3001");
  assert.equal(result.error, null);
  assert.match(result.warning ?? "", /localhost:3000/);
  assert.match(result.warning ?? "", /localhost:3001/);
});
