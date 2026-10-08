import assert from "node:assert/strict";
import test from "node:test";
import { initialsOf, roleLabelOf } from "./initials";

test("initials come from the name, then from the email", () => {
  assert.equal(initialsOf("Dummy Staff"), "DS");
  assert.equal(initialsOf("  ann  "), "AN");
  assert.equal(initialsOf("Ann Marie Lee"), "AM");
  assert.equal(initialsOf(null, "rizqi.hidayat@millennia21.id"), "RH");
  assert.equal(initialsOf(null, "rizqi@millennia21.id"), "RI");
  assert.equal(initialsOf(null, null), "U");
});

test("role keys read as labels", () => {
  assert.equal(roleLabelOf("cashier_lead"), "Cashier Lead");
  assert.equal(roleLabelOf("admin"), "Admin");
  assert.equal(roleLabelOf(null), "");
});
