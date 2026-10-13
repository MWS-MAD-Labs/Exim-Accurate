import assert from "node:assert/strict";
import test from "node:test";
import { hubHomeUrl } from "./hub-home";

test("gives the Hub front page, whatever path the address carries", () => {
  process.env.HUB_BASE_URL = "http://localhost:5175/apps/";
  assert.equal(hubHomeUrl(), "http://localhost:5175/");
});

test("is null when the Hub address is missing or not an address", () => {
  delete process.env.HUB_BASE_URL;
  assert.equal(hubHomeUrl(), null);
  process.env.HUB_BASE_URL = "not an address";
  assert.equal(hubHomeUrl(), null);
});
