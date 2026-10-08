import assert from "node:assert/strict";
import test from "node:test";
import { decodeRelayEntitlement } from "./mws-sso";

process.env.HUB_SSO_APP_ID = "exima";

function token(entitlement: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify({ entitlement })).toString("base64url");
  return `h.${payload}.s`;
}

const base = { id: "e1", application_id: "exima", organization_id: "o1", permissions: ["store.use"], version: 1 };

test("accepts the role keys Central stores and keeps them lowercase", () => {
  assert.equal(decodeRelayEntitlement(token({ ...base, role: "ADMIN" })).role, "admin");
  assert.equal(decodeRelayEntitlement(token({ ...base, role: "CASHIER_LEAD" })).role, "cashier_lead");
});

test("rejects a role key that is not a Central key", () => {
  assert.throws(() => decodeRelayEntitlement(token({ ...base, role: "cashier lead" })), /invalid/);
  assert.throws(() => decodeRelayEntitlement(token({ ...base, role: "" })), /invalid/);
});

test("rejects permissions Exima does not know", () => {
  assert.throws(
    () => decodeRelayEntitlement(token({ ...base, role: "STAFF", permissions: ["store.use", "nope"] })),
    /unsupported permissions/,
  );
});
