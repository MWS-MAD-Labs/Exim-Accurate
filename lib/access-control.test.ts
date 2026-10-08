import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_PERMISSIONS,
  PERMISSION_MANIFEST,
  ROLE_PERMISSIONS,
  getRoleHome,
  hasAnyPermission,
} from "./access-control";
import { comparePermissions, permissionCheckFailed } from "./central-permissions";

test("manifest lists every permission once", () => {
  assert.deepEqual(PERMISSION_MANIFEST.map((entry) => entry.key), [...APP_PERMISSIONS]);
  assert.ok(PERMISSION_MANIFEST.every((entry) => entry.description));
});

test("requires point at known permissions and never loop", () => {
  const needs = new Map(PERMISSION_MANIFEST.map((entry) => [entry.key as string, entry.requires ?? []]));
  for (const [key, required] of needs) {
    for (const other of required) assert.ok(needs.has(other), `${key} requires unknown ${other}`);
    const seen = new Set<string>();
    const walk = (current: string) => {
      assert.ok(!seen.has(current) && current !== key || seen.size === 0, `${key} loops`);
      seen.add(current);
      for (const next of needs.get(current) ?? []) walk(next);
    };
    walk(key);
  }
});

test("built-in roles already carry what their permissions require", () => {
  const needs = new Map(PERMISSION_MANIFEST.map((entry) => [entry.key as string, entry.requires ?? []]));
  for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    for (const permission of permissions) {
      for (const required of needs.get(permission) ?? []) {
        assert.ok(permissions.includes(required as never), `${role}: ${permission} requires ${required}`);
      }
    }
  }
});

test("a custom role lands on the home its permissions allow", () => {
  assert.equal(getRoleHome("cashier_lead", ["pos.checkout", "pos.catalog.read"]), "/pos-cashier");
  assert.equal(getRoleHome("admin", ["dashboard.read"]), "/dashboard");
  assert.equal(getRoleHome("cashier"), "/pos-cashier");
  assert.equal(getRoleHome("unknown", []), "/login");
});

test("credential gates follow permissions, not role names", () => {
  assert.equal(hasAnyPermission(["borrowing.manage"], ["credentials.manage", "borrowing.manage"]), true);
  assert.equal(hasAnyPermission(["credentials.read"], ["credentials.manage", "borrowing.manage"]), false);
});

test("check flags drift but not permissions that are only new", () => {
  const code = [{ key: "a" }, { key: "b", requires: ["a"] }];
  const fresh = comparePermissions(code, [{ key: "a", description: null, requires: [], source: "MANIFEST", deprecated: false }], []);
  assert.deepEqual(fresh.notRegistered, ["b"]);
  assert.equal(permissionCheckFailed(fresh), false);
  const drift = comparePermissions(code, [
    { key: "a", description: null, requires: [], source: "MANIFEST", deprecated: false },
    { key: "b", description: null, requires: [], source: "MANIFEST", deprecated: false },
    { key: "old", description: null, requires: [], source: "MANIFEST", deprecated: false },
  ], ["ghost"]);
  assert.deepEqual(drift.requiresDiffer, ["b"]);
  assert.deepEqual(drift.wouldDrop, ["old"]);
  assert.deepEqual(drift.unknownToCode, ["ghost"]);
  assert.equal(permissionCheckFailed(drift), true);
});
