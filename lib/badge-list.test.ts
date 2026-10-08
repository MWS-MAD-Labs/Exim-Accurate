import assert from "node:assert/strict";
import test from "node:test";
import { BADGE_PAGE_SIZES, badgeHolderWhere, parseBadgePageSize } from "./badge-list";

test("only the offered page sizes are accepted", () => {
  assert.deepEqual([...BADGE_PAGE_SIZES], [25, 50, 100]);
  assert.equal(parseBadgePageSize("50"), 50);
  assert.equal(parseBadgePageSize("100"), 100);
  for (const bad of [null, "", "7", "500", "abc"]) assert.equal(parseBadgePageSize(bad), 25);
});

test("badge holders are people of the organization with a Central identity and access", () => {
  const where = badgeHolderWhere("org-1", "  ann  ");
  assert.equal(where.organizationId, "org-1");
  assert.deepEqual(where.centralPersonId, { not: null });
  assert.equal(where.centralStatus, "active");
  assert.deepEqual(where.NOT, { permissions: { isEmpty: true } });
  assert.equal((where.OR as unknown[]).length, 2);
  assert.equal("OR" in badgeHolderWhere("org-1"), false);
});
