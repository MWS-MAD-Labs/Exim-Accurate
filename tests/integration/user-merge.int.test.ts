import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { mergeUsers, planUserMerge } from "@/lib/user-merge";
import { TEST_ORG, clean, requireDatabase } from "./support";

const OTHER_ORG = "org_exima_test_other";

describe("merging an older account into the one tied to Central", () => {
  let organizationId = "";
  let otherOrganizationId = "";
  let credentialId = "";
  let oldId = "";
  let newId = "";

  async function removeAll() {
    const mine = { credential: { organization: { centralOrganizationId: TEST_ORG } } };
    await prisma.checkoutSession.deleteMany({ where: mine });
    await prisma.posStaffDayOff.deleteMany({ where: mine });
    await prisma.accurateCredentials.deleteMany({ where: { organization: { centralOrganizationId: { in: [TEST_ORG, OTHER_ORG] } } } });
    await prisma.userEmailHistory.deleteMany({ where: { user: { email: { startsWith: "test_" } } } });
    await prisma.user.deleteMany({ where: { OR: [{ email: { startsWith: "test_" } }, { email: { startsWith: "merged" } }] } });
    await prisma.organization.deleteMany({ where: { centralOrganizationId: OTHER_ORG } });
    await clean();
  }

  before(requireDatabase);
  beforeEach(async () => {
    await removeAll();
    organizationId = (await prisma.organization.create({ data: { name: "TEST Exima", centralOrganizationId: TEST_ORG } })).id;
    otherOrganizationId = (await prisma.organization.create({ data: { name: "TEST Other", centralOrganizationId: OTHER_ORG } })).id;
    oldId = (await prisma.user.create({ data: { organizationId, email: "test_dewi@millennia21.id", name: "Dewi", role: "admin" } })).id;
    newId = (await prisma.user.create({ data: { organizationId, email: "test_dewi.astuti@millennia21.id", name: "Dewi", centralPersonId: "p-dewi" } })).id;
    credentialId = (await prisma.accurateCredentials.create({
      data: { organizationId, userId: oldId, appKey: "k", signatureSecret: "s", apiToken: "t" },
    })).id;
  });
  afterEach(removeAll);
  after(() => prisma.$disconnect());

  const session = (staffEmail: string, staffPersonId: string | null = null) =>
    prisma.checkoutSession.create({ data: { credentialId, staffEmail, staffPersonId } });
  const dayOff = (staffEmail: string, date: string, staffPersonId: string | null = null) =>
    prisma.posStaffDayOff.create({ data: { credentialId, staffEmail, staffPersonId, date: new Date(date) } });

  it("shows what would move and changes nothing", async () => {
    await session("test_dewi@millennia21.id");
    const plan = await planUserMerge(prisma, { fromId: oldId, intoId: newId, organizationId });
    assert.ok("from" in plan);
    assert.deepEqual(plan.blockers, []);
    assert.equal(plan.moves.find((move) => move.table === "AccurateCredentials")?.rows, 1);
    assert.deepEqual(plan.staffRows, { claimable: 1, clash: 0 });
    assert.equal(await prisma.user.count({ where: { id: oldId } }), 1);
    assert.equal((await prisma.accurateCredentials.findUniqueOrThrow({ where: { id: credentialId } })).userId, oldId);
  });

  it("moves what the old account owns and its rows by email, keeps the old email, and removes the old account", async () => {
    await prisma.userEmailHistory.create({ data: { userId: oldId, email: "test_dewi.lama@millennia21.id" } });
    const own = await session("test_dewi@millennia21.id");
    const earlier = await session("test_dewi.lama@millennia21.id");
    const someoneElse = await session("test_other@millennia21.id");

    const result = await mergeUsers({ fromId: oldId, intoId: newId, organizationId });

    assert.equal(result.ok, true);
    assert.equal(await prisma.user.count({ where: { id: oldId } }), 0);
    assert.equal((await prisma.accurateCredentials.findUniqueOrThrow({ where: { id: credentialId } })).userId, newId);
    const person = async (row: { id: string }) => (await prisma.checkoutSession.findUniqueOrThrow({ where: { id: row.id } })).staffPersonId;
    assert.equal(await person(own), "p-dewi");
    assert.equal(await person(earlier), "p-dewi");
    assert.equal(await person(someoneElse), null);
    const kept = (await prisma.userEmailHistory.findMany({ where: { userId: newId } })).map((row) => row.email).sort();
    assert.deepEqual(kept, ["test_dewi.lama@millennia21.id", "test_dewi@millennia21.id"]);
  });

  it("refuses and leaves everything as it was when the staff rows clash with the other account's", async () => {
    await dayOff("test_dewi.astuti@millennia21.id", "2026-12-01", "p-dewi");
    await dayOff("test_dewi@millennia21.id", "2026-12-01");

    const result = await mergeUsers({ fromId: oldId, intoId: newId, organizationId });

    assert.deepEqual(result, { ok: false, blockers: ["STAFF_ROWS_CLASH"] });
    assert.equal(await prisma.user.count({ where: { id: oldId } }), 1);
    assert.equal((await prisma.accurateCredentials.findUniqueOrThrow({ where: { id: credentialId } })).userId, oldId);
  });

  it("refuses an account that is already tied, a target that is not, the same account, and another organization", async () => {
    const tiedOld = await prisma.user.create({ data: { organizationId, email: "test_tied@millennia21.id", centralPersonId: "p-tied" } });
    const untied = await prisma.user.create({ data: { organizationId, email: "test_untied@millennia21.id" } });
    const foreign = await prisma.user.create({ data: { organizationId: otherOrganizationId, email: "test_foreign@millennia21.id", centralPersonId: "p-foreign" } });

    const blockersOf = async (fromId: string, intoId: string) => {
      const plan = await planUserMerge(prisma, { fromId, intoId, organizationId });
      return plan.blockers;
    };
    assert.deepEqual(await blockersOf(tiedOld.id, newId), ["OLD_IS_LINKED"]);
    assert.deepEqual(await blockersOf(oldId, untied.id), ["TARGET_NOT_LINKED"]);
    assert.deepEqual(await blockersOf(oldId, oldId), ["SAME_ACCOUNT"]);
    assert.deepEqual(await blockersOf(oldId, foreign.id), ["OTHER_ORGANIZATION"]);
    assert.deepEqual(await blockersOf(oldId, "does-not-exist"), ["NOT_FOUND"]);
    assert.equal((await mergeUsers({ fromId: tiedOld.id, intoId: newId, organizationId })).ok, false);
  });
});
