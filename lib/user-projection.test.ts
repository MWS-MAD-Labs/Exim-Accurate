import assert from "node:assert/strict";
import test from "node:test";
import { parseEntitlement } from "./user-projection";

process.env.HUB_SSO_APP_ID = "exima";

const base = { id: "e1", organization_id: "o1", permissions: ["store.use"], version: 1 };

test("accepts the role keys Central stores and keeps them lowercase", () => {
  assert.equal(parseEntitlement({ ...base, role: "ADMIN" }).role, "admin");
  assert.equal(parseEntitlement({ ...base, role: "CASHIER_LEAD" }).role, "cashier_lead");
});

test("takes what Central's lookup returns, with or without the application id", () => {
  assert.equal(parseEntitlement({ ...base, role: "STAFF", application_id: "exima", is_active: true }).version, 1);
  assert.throws(() => parseEntitlement({ ...base, role: "STAFF", application_id: "another-app" }), /invalid/);
});

test("rejects a role key that is not a Central key", () => {
  assert.throws(() => parseEntitlement({ ...base, role: "cashier lead" }), /invalid/);
  assert.throws(() => parseEntitlement({ ...base, role: "" }), /invalid/);
});

test("rejects permissions Exima does not know, and a missing entitlement", () => {
  assert.throws(() => parseEntitlement({ ...base, role: "STAFF", permissions: ["store.use", "nope"] }), /unsupported permissions/);
  assert.throws(() => parseEntitlement(null), /missing/);
});
