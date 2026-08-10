import { prisma } from "@/lib/prisma";

export async function getOrganizationIdForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  });

  return user?.organizationId ?? null;
}
