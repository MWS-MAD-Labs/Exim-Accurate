import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS, hasPermission, type AppPermission } from "./access-control";

// Who could use a route when the gates went by role name. The gates now go by permission, and the
// four built-in roles must keep exactly the access they had.
const formerlyAllowed: Partial<Record<AppPermission, string[]>> = {
  "allowance.manage": ["admin"],
  "pos.manage": ["admin"],
  "pos.sales.void": ["admin"],
  "analytics.read": ["admin"],
  "pos.checkout": ["admin", "cashier"],
  "store.use": ["admin", "staff"],
  "pos.catalog.read": ["admin", "cashier", "staff"],
  "borrowing.manage": ["admin", "resource"],
  "inventory.export": ["admin", "resource"],
  "inventory.import": ["admin", "resource"],
  "users.manage": ["admin"],
  "credentials.manage": ["admin"],
  "dashboard.read": ["admin"],
};

test("built-in roles keep the access they had when gates went by role name", () => {
  for (const [permission, roles] of Object.entries(formerlyAllowed)) {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      assert.equal(
        hasPermission(permissions, permission as AppPermission),
        roles!.includes(role),
        `${role} / ${permission}`,
      );
    }
  }
});

test("a custom role follows its permissions and nothing else", () => {
  const lead = ["pos.checkout", "pos.catalog.read"];
  assert.equal(hasPermission(lead, "pos.checkout"), true);
  assert.equal(hasPermission(lead, "pos.manage"), false);
  assert.equal(hasPermission([], "pos.checkout"), false);
  assert.equal(hasPermission(undefined, "pos.checkout"), false);
});
