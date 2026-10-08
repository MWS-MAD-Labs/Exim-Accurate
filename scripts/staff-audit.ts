// Lists POS rows whose staff email does not match any Exima user, so nobody's history is left
// without an id when staff are keyed by the Central person id. Changes nothing.
//   npm run staff:audit
import { prisma } from "../lib/prisma";

const TABLES = [
  ["PosSale", "staffEmail"],
  ["PosReservation", "staffEmail"],
  ["CheckoutSession", "staffEmail"],
  ["PosStaffDayOff", "staffEmail"],
  ["PosStaffAllowanceAdjustment", "staffEmail"],
  ["PosStaffAllowanceDebtSettlement", "staffEmail"],
  ["PosAllowanceNotification", "staffEmail"],
] as const;

async function main() {
  let orphans = 0;
  for (const [table, column] of TABLES) {
    const rows = await prisma.$queryRawUnsafe<{ email: string; rows: bigint }[]>(
      `SELECT lower(t."${column}") AS email, count(*) AS rows
         FROM "${table}" t
        WHERE t."${column}" IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM "User" u WHERE lower(u.email) = lower(t."${column}") AND u."centralPersonId" IS NOT NULL)
        GROUP BY 1 ORDER BY 2 DESC`,
    );
    const total = rows.reduce((sum, row) => sum + Number(row.rows), 0);
    orphans += total;
    console.log(`${table}: ${total} rows without a matching user${rows.length ? ` (${rows.length} emails)` : ""}`);
    for (const row of rows.slice(0, 10)) console.log(`  ${row.email}: ${row.rows}`);
  }
  console.log(orphans === 0 ? "All staff rows can be tied to a person id." : `${orphans} rows would stay without a person id.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
