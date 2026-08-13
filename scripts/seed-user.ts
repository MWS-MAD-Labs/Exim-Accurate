import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2] || "admin@example.com";
  const password = process.argv[3] || "password123";
  const role = process.argv[4] || "admin";
  const name = process.argv[5]?.trim() || null;

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    console.log(`User with email ${email} already exists.`);
    return;
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = await prisma.user.create({
    data: {
      organization: {
        connectOrCreate: {
          where: { id: "default-organization" },
          create: { id: "default-organization", name: "Default Organization" },
        },
      },
      email,
      name,
      password: hashedPassword,
      role,
    },
  });

  console.log("User created successfully:");
  console.log(`Email: ${user.email}`);
  console.log(`Name: ${user.name || "Not set"}`);
  console.log(`Role: ${user.role}`);
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
