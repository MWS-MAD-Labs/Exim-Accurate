import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const organizationId = process.argv[2];
  const centralOrganizationId = process.argv[3];
  if (!organizationId || !centralOrganizationId) {
    throw new Error("Usage: npm run db:map-central-organization -- <organizationId> <centralOrganizationId>");
  }

  const organization = await prisma.organization.update({
    where: { id: organizationId },
    data: { centralOrganizationId },
    select: { id: true, name: true, centralOrganizationId: true },
  });
  console.log(organization);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
