import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "admin@example.com";
  const centralPersonId = process.argv[3];
  const centralOrganizationId = process.argv[4];
  const name = process.argv[5]?.trim() || null;
  if (!centralPersonId || !centralOrganizationId) {
    throw new Error("Usage: npm run db:seed -- <email> <centralPersonId> <centralOrganizationId> [name]");
  }

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`User with email ${email} already exists.`);
    return;
  }

  // Create user
  const user = await prisma.user.create({
    data: {
      organization: {
        connectOrCreate: {
          where: { id: "default-organization" },
          create: {
            id: "default-organization",
            centralOrganizationId,
            name: "Default Organization",
          },
        },
      },
      email,
      centralPersonId,
      name,
    },
  });

  console.log("User created successfully:");
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.name || "Not set"}`);
  console.log(`Central Person ID: ${user.centralPersonId}`);
  console.log(`ID: ${user.id}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
