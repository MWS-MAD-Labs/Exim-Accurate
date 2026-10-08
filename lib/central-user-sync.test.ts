import assert from "node:assert/strict";
import test from "node:test";
import { linkableEntitlementId, planSync, type CentralAccessRow, type LocalUser } from "./central-user-sync";

const orgs = new Map([["exima", "org-local"]]);
const row = (over: Partial<CentralAccessRow> = {}): CentralAccessRow => ({
  id: "group:g1",
  person_id: "p1",
  organization_id: "exima",
  role: "STAFF",
  permissions: ["store.use", "pos.catalog.read"],
  version: 5,
  person: { full_name: "Dummy", email: "Dummy@X.id" },
  ...over,
});
const user = (over: Partial<LocalUser> = {}): LocalUser => ({
  id: "u1",
  organizationId: "org-local",
  centralPersonId: "p1",
  email: "dummy@x.id",
  name: "Dummy",
  role: "staff",
  permissions: ["store.use", "pos.catalog.read"],
  entitlementVersion: 5,
  centralStatus: "active",
  ...over,
});

test("group ids are not kept on a person", () => {
  assert.equal(linkableEntitlementId("group:g1"), null);
  assert.equal(linkableEntitlementId("abc"), "abc");
});

test("a new person is created, lowercase and without a shared group id", () => {
  const plan = planSync([row()], [], orgs);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].email, "dummy@x.id");
  assert.equal(plan.create[0].role, "staff");
  assert.equal(plan.create[0].centralEntitlementId, null);
  assert.equal(plan.create[0].organizationId, "org-local");
});

test("nothing changes when Central and Exima agree", () => {
  const plan = planSync([row()], [user()], orgs);
  assert.deepEqual([plan.create.length, plan.update.length, plan.revoke.length, plan.unchanged], [0, 0, 0, 1]);
});

test("a changed role or permission updates the account", () => {
  const plan = planSync([row({ role: "CASHIER_LEAD", version: 6 })], [user()], orgs);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].data.role, "cashier_lead");
});

test("an older account without a person id is matched by email and linked", () => {
  const plan = planSync([row()], [user({ centralPersonId: null })], orgs);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0].data.centralPersonId, "p1");
  assert.equal(plan.create.length, 0);
});

test("someone Central no longer lists loses their permissions, local-only accounts stay", () => {
  const plan = planSync([], [user(), user({ id: "u2", centralPersonId: null, email: "local@x.id" })], orgs);
  assert.deepEqual(plan.revoke, [{ id: "u1", centralPersonId: "p1", endSessions: true }]);
  const already = planSync([], [user({ permissions: [], centralStatus: "no_access" })], orgs);
  assert.deepEqual(already.revoke, []);
  // An account that was never classified is looked at once.
  const unclassified = planSync([], [user({ permissions: [], centralStatus: null })], orgs);
  assert.deepEqual(unclassified.revoke, [{ id: "u1", centralPersonId: "p1", endSessions: false }]);
});

test("people of an unmapped organization are skipped", () => {
  const plan = planSync([row({ organization_id: "other" })], [], orgs);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.unmapped, ["Dummy@X.id"]);
});

test("a new email in Central is recorded as a change, not as a new person", () => {
  const plan = planSync([row({ person: { full_name: "Dummy", email: "New@X.id" } })], [user()], orgs);
  assert.equal(plan.create.length, 0);
  assert.deepEqual(plan.emailChanges, [{ userId: "u1", from: "dummy@x.id", to: "new@x.id" }]);
  assert.equal(plan.update[0].data.email, "new@x.id");
});

test("an email that belongs to someone else is not taken over", () => {
  const other = user({ id: "u9", centralPersonId: "p9", email: "taken@x.id" });
  const plan = planSync([row({ person: { full_name: "Dummy", email: "taken@x.id" } })], [user(), other], orgs);
  assert.deepEqual(plan.needsReview, ["taken@x.id"]);
  assert.deepEqual(plan.emailChanges, []);
  assert.equal(plan.update.length, 0);
});

test("a new name, email, role or version does not sign the person out, losing all access does", () => {
  const renamed = planSync([row({ person: { full_name: "New Name", email: "new@x.id" }, role: "CASHIER", version: 9 })], [user()], orgs);
  assert.equal(renamed.update[0].endSessions, false);
  const narrowed = planSync([row({ permissions: ["store.use"] })], [user()], orgs);
  assert.equal(narrowed.update[0].endSessions, false);
  const gone = planSync([], [user()], orgs);
  assert.equal(gone.revoke[0].endSessions, true);
});
