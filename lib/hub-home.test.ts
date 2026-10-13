import assert from "node:assert/strict";
import test from "node:test";
import { hubHomeUrl } from "./hub-home";

function configure(base: string | undefined) {
  process.env.HUB_SSO_APP_ID = "exima";
  process.env.HUB_INTERNAL_SECRET = "secret";
  if (base === undefined) delete process.env.HUB_BASE_URL;
  else process.env.HUB_BASE_URL = base;
}

test("gives the Hub front page", () => {
  configure("http://localhost:5175/");
  assert.equal(hubHomeUrl(), "http://localhost:5175/");
});

test("is null when the Hub is not configured", () => {
  configure(undefined);
  assert.equal(hubHomeUrl(), null);
});
