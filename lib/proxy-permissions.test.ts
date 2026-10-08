import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { requiredPermissions } from "../proxy";

const need = (path: string, method = "GET") => requiredPermissions(new NextRequest(`http://localhost${path}`, { method }));

test("the staff list and the cashier badge check are for the cashier, my transactions for staff", () => {
  assert.deepEqual(need("/api/pos/staff"), ["pos.checkout"]);
  assert.deepEqual(need("/api/pos/staff/identify", "POST"), ["pos.checkout"]);
  assert.deepEqual(need("/api/pos/my-transactions"), ["store.use"]);
});

// A route the proxy knows nothing about answers 403 to everybody, so every folder under /api/pos has to be covered.
test("every API folder the proxy guards has a rule", () => {
  const root = new URL("../app/api/pos", import.meta.url).pathname;
  const missing: string[] = [];
  for (const name of readdirSync(root)) {
    if (!statSync(join(root, name)).isDirectory()) continue;
    if (need(`/api/pos/${name}`).length === 0 && need(`/api/pos/${name}/x`).length === 0) missing.push(name);
  }
  assert.deepEqual(missing, []);
});
