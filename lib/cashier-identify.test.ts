import assert from "node:assert/strict";
import test from "node:test";
import { identifyStaffForCashier } from "./cashier-identify";

const ok = { ok: true as const, personId: "p1", email: "Ann@X.id", name: "Ann", via: "token" as const };
const member = async (personId: string, organizationId: string) =>
  personId === "p1" && organizationId === "org-1" ? { name: "Ann", email: "Ann@X.id" } : null;

test("a recognized badge of this store's organization gives the person", async () => {
  const result = await identifyStaffForCashier("exb1...", "org-1", { resolve: async () => ok, member });
  assert.deepEqual(result, { ok: true, personId: "p1", email: "ann@x.id", name: "Ann" });
});

test("a badge of another organization, a revoked badge and an unknown one are refused", async () => {
  assert.deepEqual(await identifyStaffForCashier("x", "org-2", { resolve: async () => ok, member }), { ok: false, reason: "unknown" });
  assert.deepEqual(await identifyStaffForCashier("x", "org-1", { resolve: async () => ({ ok: false, reason: "revoked" }), member }), { ok: false, reason: "revoked" });
  assert.deepEqual(await identifyStaffForCashier("x", "org-1", { resolve: async () => ({ ok: false, reason: "unknown" }), member }), { ok: false, reason: "unknown" });
});
