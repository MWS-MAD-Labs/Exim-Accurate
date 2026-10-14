import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { clearAccessCacheForTest } from "@/lib/central-access";
import { prisma } from "@/lib/prisma";
import { resolveSessionUser } from "@/lib/session";
import { TEST_ENV, cookieFor, entitlement, installWorld, newWorld, useEnv } from "@/lib/test-support/hub";
import { proxy } from "../../proxy";
import { TEST_ORG, clean, emailOf, requireDatabase } from "./support";

const person = { sub: "test-person-1", email: emailOf("kasir") };
const employee = { person_id: person.sub, full_name: "TEST Kasir", email: person.email, status: "ACTIVE" };

describe("the account behind a Hub session", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();

  before(requireDatabase);
  beforeEach(async () => {
    await clean();
    restoreEnv = useEnv({ ...TEST_ENV, EXIMA_CENTRAL_ACCESS_CACHE_SECONDS: "0", CENTRAL_ORGANIZATION_ID: TEST_ORG });
    clearAccessCacheForTest();
    world = newWorld({ employee });
    restoreFetch = installWorld(world);
  });
  afterEach(() => {
    restoreFetch();
    restoreEnv();
  });
  after(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("makes the account on the first visit, from what Central says", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG, role: "CASHIER_LEAD", permissions: ["store.use", "pos.checkout"] });
    const user = await resolveSessionUser({ ...person, source: "employee" });
    assert.ok(user);
    assert.equal(user.email, person.email);
    assert.equal(user.role, "cashier_lead");
    assert.deepEqual([...user.permissions].sort(), ["pos.checkout", "store.use"]);
    assert.equal(user.centralPersonId, person.sub);
    assert.equal(await prisma.user.count({ where: { email: person.email } }), 1);
    // The organization of this deployment was mapped on the way.
    assert.equal(await prisma.organization.count({ where: { centralOrganizationId: TEST_ORG } }), 1);
  });

  it("does not write the account again when nothing changed, and does when the version moved", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG });
    await resolveSessionUser({ ...person, source: "employee" });
    const first = await prisma.user.findUniqueOrThrow({ where: { email: person.email } });
    await resolveSessionUser({ ...person, source: "employee" });
    const second = await prisma.user.findUniqueOrThrow({ where: { email: person.email } });
    assert.equal(second.entitlementSyncedAt?.getTime(), first.entitlementSyncedAt?.getTime());

    world.entitlement = entitlement({ organization_id: TEST_ORG, version: 2, permissions: ["store.use", "pos.checkout"] });
    const user = await resolveSessionUser({ ...person, source: "employee" });
    assert.equal(user?.entitlementVersion, 2);
    assert.deepEqual([...(user?.permissions ?? [])].sort(), ["pos.checkout", "store.use"]);
    assert.equal(await prisma.user.count({ where: { email: person.email } }), 1);
  });

  it("gives nothing once Central took the access away", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG });
    assert.ok(await resolveSessionUser({ ...person, source: "employee" }));
    world.entitlement = entitlement({ organization_id: TEST_ORG, is_active: false });
    assert.equal(await resolveSessionUser({ ...person, source: "employee" }), null);
  });

  it("refuses a person whose Central profile does not match the Hub session", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG });
    world.employee = { ...employee, email: emailOf("someone-else") };
    await assert.rejects(resolveSessionUser({ ...person, source: "employee" }), /does not match/);
    assert.equal(await prisma.user.count({ where: { email: person.email } }), 0);
    world.employee = { ...employee, status: "INACTIVE" };
    await assert.rejects(resolveSessionUser({ ...person, source: "employee" }), /not active/);
  });

  it("follows a new email from Central and remembers the old one, when the account is brought up to date", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG });
    await resolveSessionUser({ ...person, source: "employee" });

    // The account is brought up to date when the access changes (a new version), not on every visit.
    world.entitlement = entitlement({ organization_id: TEST_ORG, version: 2 });
    world.employee = { ...employee, email: emailOf("kasir-baru") };
    const moved = await resolveSessionUser({ sub: person.sub, email: emailOf("kasir-baru"), source: "employee" });
    assert.equal(moved?.email, emailOf("kasir-baru"));
    assert.equal(await prisma.userEmailHistory.count({ where: { user: { centralPersonId: person.sub } } }), 1);
  });

  it("cuts the permissions to nothing for a role that carries none Exima knows, and never makes the account", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG, permissions: [] });
    assert.equal(await resolveSessionUser({ ...person, source: "employee" }), null);
    assert.equal(await prisma.user.count({ where: { email: person.email } }), 0);
  });
});

describe("the proxy with an account", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();
  const ask = (path: string, cookie: string) => proxy(new NextRequest(`https://exima.test${path}`, { headers: { cookie } }));

  before(requireDatabase);
  beforeEach(async () => {
    await clean();
    restoreEnv = useEnv({ ...TEST_ENV, EXIMA_CENTRAL_ACCESS_CACHE_SECONDS: "0", CENTRAL_ORGANIZATION_ID: TEST_ORG });
    clearAccessCacheForTest();
    world = newWorld({ employee });
    restoreFetch = installWorld(world);
  });
  afterEach(() => {
    restoreFetch();
    restoreEnv();
  });
  after(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("lets through what the role allows and turns away what it does not", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG, permissions: ["store.use"] });
    const cookie = cookieFor(person);
    const allowed = await ask("/api/pos/my-transactions", cookie);
    assert.equal(allowed.headers.get("x-middleware-next"), "1");
    assert.equal((await ask("/api/pos/settings", cookie)).status, 403);
    assert.equal((await ask("/api/admin/users", cookie)).status, 403);
  });

  it("sends a page the role cannot open to the page the role starts on", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG, permissions: ["store.use"] });
    const response = await ask("/dashboard", cookieFor(person));
    assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/store");
  });
});

describe("an email that already belongs to another account", () => {
  let restoreEnv: () => void;
  let restoreFetch: () => void;
  let world = newWorld();

  before(requireDatabase);
  beforeEach(async () => {
    await clean();
    restoreEnv = useEnv({ ...TEST_ENV, EXIMA_CENTRAL_ACCESS_CACHE_SECONDS: "0", CENTRAL_ORGANIZATION_ID: TEST_ORG });
    clearAccessCacheForTest();
    world = newWorld({ employee });
    restoreFetch = installWorld(world);
  });
  afterEach(() => {
    restoreFetch();
    restoreEnv();
  });
  after(async () => {
    await clean();
    await prisma.$disconnect();
  });

  it("is not taken: the account keeps its own", async () => {
    world.entitlement = entitlement({ organization_id: TEST_ORG });
    await resolveSessionUser({ ...person, source: "employee" });
    const other = { sub: "test-person-2", email: emailOf("lain") };
    world.employee = { person_id: other.sub, full_name: "TEST Lain", email: other.email, status: "ACTIVE" };
    world.entitlement = entitlement({ id: "ent-2", organization_id: TEST_ORG });
    await resolveSessionUser({ ...other, source: "employee" });

    // Central gives the first person the email the second one has.
    world.employee = { ...employee, email: other.email };
    world.entitlement = entitlement({ organization_id: TEST_ORG, version: 2 });
    const kept = await resolveSessionUser({ sub: person.sub, email: other.email, source: "employee" });
    assert.equal(kept?.email, person.email);
    assert.equal(await prisma.user.count({ where: { email: { startsWith: "test_" } } }), 2);
  });
});
