import assert from "node:assert/strict";
import test from "node:test";
import { issueBadgeToken, verifyBadgeToken } from "./badge-token";

test("a token verifies for the person and version it was made for", () => {
  process.env.EXIMA_BADGE_SECRET = "a-test-secret-of-some-length";
  const token = issueBadgeToken("person-1", 3);
  assert.match(token, /^exb1\.person-1\.3\.[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(verifyBadgeToken(token), { personId: "person-1", version: 3 });
});

test("changing anything in the token, or the secret, makes it fail", () => {
  process.env.EXIMA_BADGE_SECRET = "a-test-secret-of-some-length";
  const token = issueBadgeToken("person-1", 3);
  assert.equal(verifyBadgeToken(token.replace("person-1", "person-2")), null);
  assert.equal(verifyBadgeToken(token.replace(".3.", ".4.")), null);
  assert.equal(verifyBadgeToken(token + "x"), null);
  assert.equal(verifyBadgeToken("exb1.person-1.3"), null);
  assert.equal(verifyBadgeToken("person-1"), null);
  process.env.EXIMA_BADGE_SECRET = "another-secret-of-some-length";
  assert.equal(verifyBadgeToken(token), null);
});

test("without a secret nothing is issued or accepted", () => {
  process.env.EXIMA_BADGE_SECRET = "a-test-secret-of-some-length";
  const token = issueBadgeToken("person-1", 1);
  delete process.env.EXIMA_BADGE_SECRET;
  assert.throws(() => issueBadgeToken("person-1", 1), /EXIMA_BADGE_SECRET/);
  assert.equal(verifyBadgeToken(token), null);
  process.env.EXIMA_BADGE_SECRET = "short";
  assert.equal(verifyBadgeToken(token), null);
});
