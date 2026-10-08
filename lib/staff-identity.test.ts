import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { issueBadgeToken } from "./badge-token";
import { hasActiveAccess, resolveBadge, staffData, staffWhere, type StaffLookup, type StaffUser } from "./staff-identity";

process.env.EXIMA_BADGE_SECRET = "a-test-secret-of-some-length";

const ann: StaffUser = { id: "u1", name: "Ann", email: "ann.new@x.id", centralPersonId: "p1", badgeVersion: 2, permissions: ["store.use"], centralStatus: "active" };
const local: StaffUser = { id: "u2", name: "Old", email: "old@x.id", centralPersonId: null, badgeVersion: 1, permissions: ["store.use"], centralStatus: "active" };
const gone: StaffUser = { id: "u3", name: "Gone", email: "gone@x.id", centralPersonId: "p3", badgeVersion: 1, permissions: [], centralStatus: "no_access" };

const lookup: StaffLookup = {
  byEmail: async (email) => (email === "ann.new@x.id" ? ann : email === "old@x.id" ? local : email === "gone@x.id" ? gone : null),
  byPersonId: async (id) => (id === "p1" ? ann : id === "p3" ? gone : null),
  byPreviousEmail: async (email) => (email === "ann.old@x.id" ? { user: ann, replacedAt: new Date() } : null),
};

afterEach(() => {
  delete process.env.EXIMA_LEGACY_EMAIL_BADGES;
});

test("a signed badge gives the person, whatever their email is now", async () => {
  const result = await resolveBadge(issueBadgeToken("p1", 2), lookup);
  assert.deepEqual(result.ok && [result.personId, result.email, result.via], ["p1", "ann.new@x.id", "token"]);
});

test("a badge from before a reissue is revoked, a forged or cut one is unknown", async () => {
  assert.deepEqual(await resolveBadge(issueBadgeToken("p1", 1), lookup), { ok: false, reason: "revoked" });
  const good = issueBadgeToken("p1", 2);
  assert.deepEqual(await resolveBadge(good.slice(0, -1) + (good.endsWith("A") ? "B" : "A"), lookup), { ok: false, reason: "unknown" });
  assert.deepEqual(await resolveBadge(good.replace(".p1.", ".p9."), lookup), { ok: false, reason: "unknown" });
  assert.deepEqual(await resolveBadge("exb1.p1.2", lookup), { ok: false, reason: "unknown" });
});

test("a plain person id and a former email do not open anything", async () => {
  assert.deepEqual(await resolveBadge("pid:p1", lookup), { ok: false, reason: "unknown" });
  assert.deepEqual(await resolveBadge("ann.old@x.id", lookup), { ok: false, reason: "unknown" });
});

test("the email on today's cards works while allowed and only for the current email", async () => {
  const on = await resolveBadge(" Ann.New@x.id ", lookup);
  assert.deepEqual(on.ok && [on.personId, on.via], ["p1", "email"]);
  assert.deepEqual(await resolveBadge("old@x.id", lookup), { ok: false, reason: "unknown" });
  assert.deepEqual(await resolveBadge("nobody@x.id", lookup), { ok: false, reason: "unknown" });
  process.env.EXIMA_LEGACY_EMAIL_BADGES = "off";
  assert.deepEqual(await resolveBadge("ann.new@x.id", lookup), { ok: false, reason: "unknown" });
  assert.equal((await resolveBadge(issueBadgeToken("p1", 2), lookup)).ok, true);
});

test("rows are found by person id, with older rows still found by email", () => {
  assert.deepEqual(staffWhere({ personId: "p1", email: "a@x.id" }), {
    OR: [{ staffPersonId: "p1" }, { staffPersonId: null, staffEmail: "a@x.id" }],
  });
  assert.deepEqual(staffWhere({ personId: null, email: "g@x.id" }), { staffEmail: "g@x.id" });
  assert.deepEqual(staffData({ personId: "p1", email: "a@x.id" }), { staffPersonId: "p1", staffEmail: "a@x.id" });
});

test("someone who lost access in Central is turned away, by badge and by email", async () => {
  assert.deepEqual(await resolveBadge(issueBadgeToken("p3", 1), lookup), { ok: false, reason: "inactive" });
  assert.deepEqual(await resolveBadge("gone@x.id", lookup), { ok: false, reason: "inactive" });
  assert.equal(hasActiveAccess(gone), false);
  assert.equal(hasActiveAccess({ permissions: ["store.use"], centralStatus: "unknown" }), false);
  assert.equal(hasActiveAccess(ann), true);
});
