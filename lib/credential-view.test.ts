import assert from "node:assert/strict";
import test from "node:test";
import { APP_PERMISSIONS, ROLE_PERMISSIONS } from "./access-control";
import { credentialView, seesAllSales } from "./credential-view";

test("a role made in Central with every permission sees everything, whatever it is called", () => {
  assert.equal(credentialView([...APP_PERMISSIONS]), "all");
  assert.equal(seesAllSales([...APP_PERMISSIONS]), true);
});

test("the built in roles see what they always did", () => {
  assert.equal(credentialView(ROLE_PERMISSIONS.admin), "all");
  assert.equal(credentialView(ROLE_PERMISSIONS.resource), "connected");
  assert.equal(credentialView(ROLE_PERMISSIONS.cashier), "store");
  assert.equal(credentialView(ROLE_PERMISSIONS.staff), "store");
});

test("without a credential permission there is nothing to see", () => {
  assert.equal(credentialView([]), "none");
  assert.equal(credentialView(null), "none");
  assert.equal(credentialView(["store.use", "pos.checkout"]), "none");
});

test("only someone who manages the POS sees the sales of others", () => {
  assert.equal(seesAllSales(ROLE_PERMISSIONS.cashier), false);
  assert.equal(seesAllSales(["pos.manage"]), true);
  assert.equal(seesAllSales(undefined), false);
});
