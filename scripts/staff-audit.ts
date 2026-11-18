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

  // An account with no Central identity is the one at risk: if Central changes the person's email before it is tied,
  // the next sync makes a new account and the allowance stays behind. Run npm run users:sync, or Link to Central.
  const unlinked = await prisma.user.findMany({
    where: { centralPersonId: null },
    select: { email: true, name: true },
    orderBy: { email: "asc" },
  });
  console.log(`${unlinked.length} accounts have no Central identity yet.`);
  for (const user of unlinked.slice(0, 20)) console.log(`  ${user.email}${user.name ? ` (${user.name})` : ""}`);

  // Two accounts with the same name where one is tied and the other is not: probably one person.
  const pairs = await prisma.$queryRawUnsafe<{ name: string; emails: string[] }[]>(
    `SELECT min(lower(trim(name))) AS name, array_agg(email ORDER BY email) AS emails
       FROM "User" WHERE name IS NOT NULL AND trim(name) <> ''
      GROUP BY "organizationId", lower(trim(name))
     HAVING count(*) > 1 AND count(*) FILTER (WHERE "centralPersonId" IS NULL) > 0 AND count(*) FILTER (WHERE "centralPersonId" IS NOT NULL) > 0`,
  );
  console.log(`${pairs.length} names appear on a tied and an untied account.`);
  for (const pair of pairs.slice(0, 20)) console.log(`  ${pair.name}: ${pair.emails.join(", ")}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
