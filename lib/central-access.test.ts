import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import {
  clearAccessCacheForTest,
  decideSession,
  lookupEntitlement,
  eximaAccessMode,
  resolveAccess,
  type Access,
  type CentralEntitlement,
} from "./central-access";

const person = { email: "a@x.id", personId: "p1" };
const entitlement = (over: Partial<CentralEntitlement> = {}): CentralEntitlement => ({
  id: "e1",
  organization_id: "exima",
  role: "STAFF",
  permissions: ["store.use", "pos.catalog.read"],
  version: 1,
  is_active: true,
  ...over,
});

beforeEach(() => {
  clearAccessCacheForTest();
  delete process.env.EXIMA_CENTRAL_ACCESS_MODE;
  delete process.env.EXIMA_CENTRAL_ACCESS_BYPASS_EMAILS;
  delete process.env.EXIMA_CENTRAL_ACCESS_CACHE_SECONDS;
});

test("mode defaults to off and ignores nonsense", () => {
  assert.equal(eximaAccessMode(), "off");
  process.env.EXIMA_CENTRAL_ACCESS_MODE = "ENFORCE";
  assert.equal(eximaAccessMode(), "enforce");
  process.env.EXIMA_CENTRAL_ACCESS_MODE = "loud";
  assert.equal(eximaAccessMode(), "off");
});

test("resolveAccess tells the five outcomes apart", async () => {
  assert.equal((await resolveAccess(person, async () => entitlement())).status, "granted");
  clearAccessCacheForTest();
  assert.equal((await resolveAccess(person, async () => null)).status, "no_access");
  assert.equal((await resolveAccess(person, async () => entitlement({ is_active: false }))).status, "no_access");
  assert.equal((await resolveAccess(person, async () => entitlement({ permissions: ["nope"] }))).status, "no_permission");
  clearAccessCacheForTest();
  assert.equal((await resolveAccess(person, async () => { throw new Error("down"); })).status, "central_unavailable");
  process.env.EXIMA_CENTRAL_ACCESS_BYPASS_EMAILS = " A@x.id ";
  assert.equal((await resolveAccess(person, async () => null)).status, "bypass");
});

test("only active access is cached", async () => {
  let calls = 0;
  const lookup = async () => (++calls, entitlement());
  await resolveAccess(person, lookup);
  await resolveAccess(person, lookup);
  assert.equal(calls, 1);

  clearAccessCacheForTest();
  calls = 0;
  const denied = async () => (++calls, null);
  await resolveAccess(person, denied);
  await resolveAccess(person, denied);
  assert.equal(calls, 2);
});

const current = { role: "staff", permissions: ["store.use", "pos.catalog.read"], entitlementVersion: 1 };
const granted = (over: Partial<CentralEntitlement> = {}): Access => ({ status: "granted", entitlement: entitlement(over) });

test("a session ends only in enforce, and only without access", () => {
  const gone: Access = { status: "no_access", entitlement: null };
  assert.equal(decideSession("enforce", gone, current), "end");
  assert.equal(decideSession("warn", gone, current), "keep");
  assert.equal(decideSession("off", gone, current), "keep");
  assert.equal(decideSession("enforce", { status: "central_unavailable", entitlement: null }, current), "keep");
  assert.equal(decideSession("enforce", { status: "bypass", entitlement: null }, current), "keep");
});

test("a role change reaches the session in enforce", () => {
  assert.equal(decideSession("enforce", granted(), current), "keep");
  assert.equal(decideSession("enforce", granted({ role: "CASHIER_LEAD" }), current), "update");
  assert.equal(decideSession("enforce", granted({ permissions: ["store.use"] }), current), "update");
  assert.equal(decideSession("enforce", granted({ version: 2 }), current), "update");
  assert.equal(decideSession("warn", granted({ role: "CASHIER_LEAD" }), current), "keep");
});

test("a retired application answer from Central ends access instead of reading as Central being down", async () => {
  process.env.CENTRAL_API_BASE_URL = "http://central.test/api/internal";
  process.env.CENTRAL_API_TOKEN = "t";
  const original = globalThis.fetch;
  const reply = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
  try {
    globalThis.fetch = reply(403, { errors: "Application retired", code: "application_retired" }) as typeof fetch;
    assert.equal(await lookupEntitlement("p1"), null);
    const access = await resolveAccess(person);
    assert.equal(access.status, "no_access");

    globalThis.fetch = reply(401, { errors: "Unauthorized" }) as typeof fetch;
    await assert.rejects(() => lookupEntitlement("p1"));
    assert.equal((await resolveAccess(person)).status, "central_unavailable");
  } finally {
    globalThis.fetch = original;
  }
});
