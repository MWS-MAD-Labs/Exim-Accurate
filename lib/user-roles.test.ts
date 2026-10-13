import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_PERMISSIONS } from "./access-control";
import { roleLabel, roleTone } from "./user-roles";

test("the built in roles keep their colour", () => {
  assert.equal(roleTone("admin").color, "red");
  assert.equal(roleTone("cashier").color, "green");
  assert.equal(roleTone("resource").color, "blue");
  assert.equal(roleTone("staff").color, "gray");
});

test("a role from Central is coloured by what it can do and written with capitals", () => {
  assert.deepEqual(
    [roleTone("super_admin", ["users.manage", "credentials.manage"]).color, roleTone("super_admin", ["users.manage"]).label],
    ["red", "Super Admin"],
  );
  assert.equal(roleTone("till_lead", ROLE_PERMISSIONS.cashier).color, "green");
  assert.equal(roleTone("stock_keeper", ["inventory.import"]).color, "blue");
  assert.equal(roleTone("viewer", ["store.use"]).color, "gray");
  assert.equal(roleTone("viewer").color, "gray");
  assert.equal(roleLabel("cashier_lead"), "Cashier Lead");
});
