import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { lockPosSynchronization } from "./pos-server";

const databaseUrl = process.env.POS_TEST_DATABASE_URL;

test("lockPosSynchronization executes against PostgreSQL without void deserialization errors", {
  skip: databaseUrl ? false : "POS_TEST_DATABASE_URL is not configured",
}, async () => {
  const client = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
  try {
    const result = await client.$transaction(async (tx) => {
      await lockPosSynchronization(tx, "integration-test-credential");
      const rows = await tx.$queryRaw<Array<{ value: number }>>`SELECT 1::int AS value`;
      return rows[0]?.value;
    });
    assert.equal(result, 1);
  } finally {
    await client.$disconnect();
  }
});
