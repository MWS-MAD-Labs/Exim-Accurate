import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { claimForUsersWithHistory, claimLegacyRows, countLegacyRows } from "@/lib/staff-identity";
import { TEST_ORG, clean, requireDatabase } from "./support";

describe("older POS rows follow the person", () => {
  let credentialId = "";

  async function removeAll() {
    const mine = { credential: { organization: { centralOrganizationId: TEST_ORG } } };
    await prisma.checkoutSession.deleteMany({ where: mine });
    await prisma.posStaffDayOff.deleteMany({ where: mine });
    await prisma.accurateCredentials.deleteMany({ where: { organization: { centralOrganizationId: TEST_ORG } } });
    await clean();
  }

  before(requireDatabase);
  beforeEach(async () => {
    await removeAll();
    const organization = await prisma.organization.create({ data: { name: "TEST Exima", centralOrganizationId: TEST_ORG } });
    credentialId = (await prisma.accurateCredentials.create({
      data: { organizationId: organization.id, appKey: "k", signatureSecret: "s", apiToken: "t" },
    })).id;
  });
  afterEach(removeAll);
  after(() => prisma.$disconnect());

  const session = (staffEmail: string, staffPersonId: string | null = null) =>
    prisma.checkoutSession.create({ data: { credentialId, staffEmail, staffPersonId } });
  const dayOff = (staffEmail: string, date: string, staffPersonId: string | null = null) =>
    prisma.posStaffDayOff.create({ data: { credentialId, staffEmail, staffPersonId, date: new Date(date) } });

  it("gives the id to rows under the email the person has now and every one they had, and leaves the rest alone", async () => {
    const now = await session("Roma.New@x.id");
    const before = await session("roma.old@x.id");
    const someoneElse = await session("other@x.id");
    const tied = await session("roma.new@x.id", "someone-else");

    const result = await claimLegacyRows(prisma, "p1", ["roma.new@x.id", "ROMA.OLD@x.id"]);

    assert.deepEqual(result, { claimed: 2, left: 0 });
    const id = async (row: { id: string }) => (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: row.id } })).staffPersonId;
    assert.equal(await id(now), "p1");
    assert.equal(await id(before), "p1");
    assert.equal(await id(someoneElse), null);
    assert.equal(await id(tied), "someone-else");
    // A second run finds nothing more to do.
    assert.deepEqual(await claimLegacyRows(prisma, "p1", ["roma.new@x.id", "roma.old@x.id"]), { claimed: 0, left: 0 });
  });

  it("leaves a row that would clash with one the person already has, and says so", async () => {
    await dayOff("roma.new@x.id", "2026-12-01", "p1");
    const clash = await dayOff("roma.old@x.id", "2026-12-01");
    const free = await dayOff("roma.old@x.id", "2026-12-02");

    const result = await claimLegacyRows(prisma, "p1", ["roma.new@x.id", "roma.old@x.id"]);

    assert.deepEqual(result, { claimed: 1, left: 1 });
    assert.equal((await prisma.posStaffDayOff.findUniqueOrThrow({ where: { id: clash.id } })).staffPersonId, null);
    assert.equal((await prisma.posStaffDayOff.findUniqueOrThrow({ where: { id: free.id } })).staffPersonId, "p1");
  });

  it("does not break when two older rows of different emails want the same slot: one takes it", async () => {
    await dayOff("roma.old@x.id", "2026-12-03");
    await dayOff("roma.new@x.id", "2026-12-03");

    const result = await claimLegacyRows(prisma, "p1", ["roma.new@x.id", "roma.old@x.id"]);

    assert.deepEqual(result, { claimed: 1, left: 1 });
    assert.equal(await prisma.posStaffDayOff.count({ where: { staffPersonId: "p1" } }), 1);
  });

  it("does nothing without a person or without emails", async () => {
    await session("roma.old@x.id");
    assert.deepEqual(await claimLegacyRows(prisma, "", ["roma.old@x.id"]), { claimed: 0, left: 0 });
    assert.deepEqual(await claimLegacyRows(prisma, "p1", []), { claimed: 0, left: 0 });
  });

  it("counts what would be claimed without changing anything", async () => {
    await session("roma.old@x.id");
    await session("roma.new@x.id", "p1");
    assert.equal(await countLegacyRows(prisma, ["roma.old@x.id", "roma.new@x.id"]), 1);
    assert.equal(await prisma.checkoutSession.count({ where: { staffPersonId: null } }), 1);
    assert.equal(await countLegacyRows(prisma, []), 0);
  });

  describe("everyone with an email history", () => {
    const organization = () => prisma.organization.findFirstOrThrow({ where: { centralOrganizationId: TEST_ORG } });
    const makeUser = async (email: string, centralPersonId: string | null, history: string[]) =>
      prisma.user.create({
        data: {
          organizationId: (await organization()).id,
          email,
          centralPersonId,
          emailHistory: { create: history.map((old) => ({ email: old })) },
        },
      });

    it("takes the older rows of every email along, and leaves out people without a history or without a person", async () => {
      const romasta = await makeUser("test_romasta@millennia21.id", "p-roma", ["test_roma@millennia21.id"]);
      await makeUser("test_plain@millennia21.id", "p-plain", []);
      await makeUser("test_untied@millennia21.id", null, ["test_untied.old@millennia21.id"]);
      const mine = await session("test_roma@millennia21.id");
      const plain = await session("test_plain@millennia21.id");
      const untied = await session("test_untied.old@millennia21.id");

      assert.deepEqual(await claimForUsersWithHistory(prisma), { claimed: 1, left: 0 });
      const id = async (row: { id: string }) => (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: row.id } })).staffPersonId;
      assert.equal(await id(mine), "p-roma");
      assert.equal(await id(plain), null);
      assert.equal(await id(untied), null);
      assert.deepEqual(await claimForUsersWithHistory(prisma), { claimed: 0, left: 0 });

      // Someone named in `skip` is left to the caller.
      const another = await session("test_roma@millennia21.id");
      assert.deepEqual(await claimForUsersWithHistory(prisma, new Set([romasta.id])), { claimed: 0, left: 0 });
      assert.equal(await id(another), null);
    });
  });
});
