import assert from "node:assert/strict";
import test from "node:test";
import { parseUserListQuery, statusWhere, userListWhere, userStatus } from "./user-directory";

test("status follows the Central identity and the permissions left", () => {
  assert.equal(userStatus({ centralPersonId: null, centralStatus: null, permissions: ["store.use"] }), "unknown");
  assert.equal(userStatus({ centralPersonId: "p", centralStatus: "unknown", permissions: [] }), "unknown");
  assert.equal(userStatus({ centralPersonId: "p", centralStatus: "no_access", permissions: [] }), "no_access");
  assert.equal(userStatus({ centralPersonId: "p", centralStatus: null, permissions: [] }), "no_access");
  assert.equal(userStatus({ centralPersonId: "p", centralStatus: "active", permissions: ["store.use"] }), "active");
});

test("query parsing clamps numbers and ignores unknown values", () => {
  const q = parseUserListQuery(new URLSearchParams("page=0&size=500&status=weird&role=Cashier_Lead&search=%20ann%20"));
  assert.deepEqual(q, { page: 1, size: 100, search: "ann", role: "cashier_lead", status: null });
  const d = parseUserListQuery(new URLSearchParams(""));
  assert.deepEqual([d.page, d.size, d.role, d.status], [1, 20, null, null]);
  assert.equal(parseUserListQuery(new URLSearchParams("page=3&size=10&status=no_access")).status, "no_access");
});

test("filters combine inside the organization", () => {
  const where = userListWhere("org", parseUserListQuery(new URLSearchParams("role=staff&status=no_access&search=a")));
  assert.equal(where.organizationId, "org");
  assert.equal((where.AND as unknown[]).length, 3);
  assert.deepEqual(userListWhere("org", parseUserListQuery(new URLSearchParams(""))), { organizationId: "org" });
  assert.deepEqual(statusWhere("unknown"), { OR: [{ centralPersonId: null }, { centralStatus: "unknown" }] });
});
