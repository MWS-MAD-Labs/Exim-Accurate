import assert from "node:assert/strict";
import test from "node:test";
import { closeOrRedirectHtml, hubHomeUrl } from "./hub-home";

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

test("the leave page focuses the opener and closes, falls back to the Hub, and keeps the address inside the script", () => {
  const html = closeOrRedirectHtml('http://hub.test/"</script><b>');
  assert.match(html, /window\.opener\.focus\(\)/);
  assert.match(html, /window\.close\(\)/);
  assert.match(html, /location\.replace\(hub\)/);
  assert.match(html, /var hub="http:\/\/hub\.test\/\\"\\u003c\/script>/);
  assert.equal(html.includes("</script><b>"), false);
});
