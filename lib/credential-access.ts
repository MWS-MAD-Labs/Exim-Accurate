import { prisma } from "@/lib/prisma";
import { isRoleAllowed } from "@/lib/access-control";

export async function getResourceCredential(
  role: string | null | undefined,
  credentialId: string,
) {
  if (!isRoleAllowed(role, ["admin", "resource"])) return null;
  return prisma.accurateCredentials.findFirst({
    where: { id: credentialId, disconnectedAt: null },
  });
}

export async function getOperationalPosCredential(
  role: string | null | undefined,
  credentialId: string,
) {
  if (!isRoleAllowed(role, ["admin", "cashier", "staff"])) return null;

  return prisma.accurateCredentials.findFirst({
    where: {
      id: credentialId,
      disconnectedAt: null,
      posSettings: { is: { isActive: true } },
    },
  });
}
