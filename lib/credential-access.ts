import { prisma } from "@/lib/prisma";
import { isRoleAllowed } from "@/lib/access-control";
import { getOrganizationIdForUser } from "@/lib/organization";

export async function getResourceCredential(
  userId: string,
  role: string | null | undefined,
  credentialId: string,
) {
  if (!isRoleAllowed(role, ["admin", "resource"])) return null;
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return null;

  return prisma.accurateCredentials.findFirst({
    where: { id: credentialId, organizationId, disconnectedAt: null },
  });
}

export async function getOperationalPosCredential(
  userId: string,
  role: string | null | undefined,
  credentialId: string,
) {
  if (!isRoleAllowed(role, ["admin", "cashier", "staff"])) return null;
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return null;

  return prisma.accurateCredentials.findFirst({
    where: {
      id: credentialId,
      organizationId,
      disconnectedAt: null,
      posSettings: { is: { isActive: true } },
    },
  });
}
