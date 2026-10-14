import { prisma } from "@/lib/prisma";

// Everything these tests make carries the TEST_ prefix or the test organization, and is removed again.
export const TEST_ORG = "org_exima_test";
export const emailOf = (name: string) => `test_${name}@millennia21.id`;

export async function clean() {
  await prisma.userEmailHistory.deleteMany({ where: { user: { email: { startsWith: "test_" } } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: "test_" } } });
  await prisma.organization.deleteMany({ where: { centralOrganizationId: TEST_ORG } });
}

export function requireDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run the integration tests against a test database.");
}
