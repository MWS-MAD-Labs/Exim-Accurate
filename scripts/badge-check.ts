// Shows what the server decides for what a badge reader would type.
//   npm run badge:check -- "<what the card says>"
//   npm run badge:issue -- person@example.com     (prints the signed badge of that person)
import { issueBadgeToken } from "../lib/badge-token";
import { prisma } from "../lib/prisma";
import { resolveBadge } from "../lib/staff-identity";

async function main() {
  const [mode, value] = process.argv.slice(2);
  if (!mode || !value) throw new Error('Use: badge:check -- "<card text>"  or  badge:issue -- <email>');

  if (mode === "issue") {
    const user = await prisma.user.findFirst({
      where: { email: { equals: value.trim(), mode: "insensitive" }, centralPersonId: { not: null } },
      select: { centralPersonId: true, badgeVersion: true, email: true },
    });
    if (!user?.centralPersonId) throw new Error("No staff member with that email and a Central identity");
    console.log(issueBadgeToken(user.centralPersonId, user.badgeVersion));
    return;
  }

  const result = await resolveBadge(value);
  console.log(
    result.ok
      ? `recognized: ${result.name ?? result.email} <${result.email}> (person ${result.personId}) via ${result.via}`
      : `refused: ${result.reason}`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
