import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { organizationProblem, resolveCentralOrganization } from "./central-organization";

type Row = { id: string; centralOrganizationId: string | null };

function fakeDb(rows: Row[], options: { conflictOnce?: boolean } = {}) {
  let conflict = options.conflictOnce ?? false;
  const calls = { create: 0, update: 0 };
  return {
    calls,
    rows,
    organization: {
      findUnique: async ({ where }: { where: { centralOrganizationId: string } }) => {
        const row = rows.find((item) => item.centralOrganizationId === where.centralOrganizationId);
        return row ? { id: row.id } : null;
      },
      findMany: async ({ take }: { take: number }) => rows.filter((row) => row.centralOrganizationId === null).slice(0, take).map((row) => ({ id: row.id })),
      count: async () => rows.length,
      create: async ({ data }: { data: { name: string; centralOrganizationId: string } }) => {
        calls.create += 1;
        if (conflict) {
          conflict = false;
          rows.push({ id: "raced", centralOrganizationId: data.centralOrganizationId });
          throw Object.assign(new Error("unique"), { code: "P2002" });
        }
        const row = { id: `new-${rows.length}`, centralOrganizationId: data.centralOrganizationId };
        rows.push(row);
        return { id: row.id };
      },
      update: async ({ where, data }: { where: { id: string }; data: { centralOrganizationId: string } }) => {
        calls.update += 1;
        const row = rows.find((item) => item.id === where.id)!;
        row.centralOrganizationId = data.centralOrganizationId;
        return { id: row.id };
      },
    },
  };
}

afterEach(() => {
  delete process.env.CENTRAL_ORGANIZATION_ID;
});

test("an organization that is already mapped is used as it is", async () => {
  const db = fakeDb([{ id: "a", centralOrganizationId: "org_x" }]);
  assert.deepEqual(await resolveCentralOrganization(db, "org_x"), { id: "a" });
  assert.equal(db.calls.update + db.calls.create, 0);
});

test("the one organization that is not mapped yet is mapped to the one in the .env", async () => {
  process.env.CENTRAL_ORGANIZATION_ID = "org_x";
  const db = fakeDb([{ id: "a", centralOrganizationId: null }]);
  assert.deepEqual(await resolveCentralOrganization(db, "org_x"), { id: "a" });
  assert.equal(db.rows[0]!.centralOrganizationId, "org_x");
});

test("an empty database gets its organization made", async () => {
  process.env.CENTRAL_ORGANIZATION_ID = "org_x";
  const db = fakeDb([]);
  const found = await resolveCentralOrganization(db, "org_x");
  assert.ok(found);
  assert.equal(db.rows[0]!.centralOrganizationId, "org_x");
});

test("several organizations are never guessed", async () => {
  process.env.CENTRAL_ORGANIZATION_ID = "org_x";
  const db = fakeDb([{ id: "a", centralOrganizationId: null }, { id: "b", centralOrganizationId: null }]);
  assert.equal(await resolveCentralOrganization(db, "org_x"), null);
  const other = fakeDb([{ id: "a", centralOrganizationId: "org_other" }]);
  assert.equal(await resolveCentralOrganization(other, "org_x"), null);
  assert.equal(other.calls.update + other.calls.create, 0);
});

test("an organization other than the one in the .env is not mapped", async () => {
  process.env.CENTRAL_ORGANIZATION_ID = "org_x";
  const db = fakeDb([{ id: "a", centralOrganizationId: null }]);
  assert.equal(await resolveCentralOrganization(db, "org_y"), null);
  assert.match(organizationProblem("org_y"), /not the one this Exima is set up for/);
});

test("without the setting nothing is mapped on its own", async () => {
  const db = fakeDb([{ id: "a", centralOrganizationId: null }]);
  assert.equal(await resolveCentralOrganization(db, "org_x"), null);
  assert.match(organizationProblem("org_x"), /db:map-central-organization/);
});

test("two sign-ins at once end up with the same organization", async () => {
  process.env.CENTRAL_ORGANIZATION_ID = "org_x";
  const db = fakeDb([], { conflictOnce: true });
  assert.deepEqual(await resolveCentralOrganization(db, "org_x"), { id: "raced" });
});
