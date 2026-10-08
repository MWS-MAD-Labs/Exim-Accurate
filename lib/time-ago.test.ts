import assert from "node:assert/strict";
import test from "node:test";
import { longAgo, shortAgo } from "./time-ago";

const now = Date.parse("2026-10-08T12:00:00Z");
const ago = (seconds: number) => new Date(now - seconds * 1000).toISOString();

test("the short form fits in a badge", () => {
  assert.equal(shortAgo(null, now), "never");
  assert.equal(shortAgo(ago(20), now), "now");
  assert.equal(shortAgo(ago(300), now), "5m ago");
  assert.equal(shortAgo(ago(7200), now), "2h ago");
  assert.equal(shortAgo(ago(3 * 86400), now), "3d ago");
});

test("the long form is for tooltips", () => {
  assert.equal(longAgo(ago(20), now), "just now");
  assert.equal(longAgo(ago(60), now), "1 minute ago");
  assert.equal(longAgo(ago(300), now), "5 minutes ago");
  assert.equal(longAgo(ago(7200), now), "2 hours ago");
});
