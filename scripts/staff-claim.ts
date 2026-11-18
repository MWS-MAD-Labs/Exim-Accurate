// Gives the person id to POS rows that were written under an older email, for everyone tied to a Central person.
// Without --apply it only counts. Run it once after a deploy that adds this, or after emails changed in Central.
//   npm run staff:claim
//   npm run staff:claim -- --apply
// Needs the dev dependencies, so it runs from a checkout, not inside the production image. In production the same
// claim happens when an admin forces a full sync: PUT /api/admin/users/sync.
// An email that is not in the history can be named: --email old@x.id --person <Central person id>
import { prisma } from "../lib/prisma";
import { claimLegacyRows, countLegacyRows, emailsOfUser } from "../lib/staff-identity";

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const extraEmail = option("email");
  const extraPerson = option("person");
  if (Boolean(extraEmail) !== Boolean(extraPerson)) throw new Error("--email and --person go together");

  const users = await prisma.user.findMany({
    where: { centralPersonId: extraPerson ?? { not: null } },
    select: { id: true, email: true, name: true, centralPersonId: true },
    orderBy: { email: "asc" },
  });
  if (extraPerson && users.length === 0) throw new Error(`No Exima user is tied to person ${extraPerson}`);

  let total = 0;
  let left = 0;
  for (const user of users) {
    const emails = [...(await emailsOfUser(prisma, user.id, user.email)), ...(extraEmail ? [extraEmail] : [])];
    if (apply) {
      const result = await claimLegacyRows(prisma, user.centralPersonId as string, emails);
      total += result.claimed;
      left += result.left;
      if (result.claimed > 0 || result.left > 0) console.log(`${user.email}: ${result.claimed} rows tied, ${result.left} left`);
    } else {
      const rows = await countLegacyRows(prisma, emails);
      total += rows;
      if (rows > 0) console.log(`${user.email}${user.name ? ` (${user.name})` : ""}: ${rows} rows without a person id`);
    }
  }
  console.log(
    apply
      ? `${total} rows tied to a person${left > 0 ? `, ${left} left because they clash with rows the person already has` : ""}.`
      : `${total} rows would be looked at. Nothing was changed. Add --apply to tie them.`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
