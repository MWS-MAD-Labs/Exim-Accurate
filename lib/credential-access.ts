import { prisma } from "@/lib/prisma";
import { hasAnyPermission, hasPermission } from "@/lib/access-control";
import { getOrganizationIdForUser } from "@/lib/organization";

// Who may use a credential follows the permissions of the person's role in Central, not the
// name of the role, so a role made in Central works as soon as it carries the right permissions.
export async function getResourceCredential(
  userId: string,
  permissions: readonly string[] | null | undefined,
  credentialId: string,
) {
  if (!hasAnyPermission(permissions, ["credentials.manage", "borrowing.manage"])) return null;
  const organizationId = await getOrganizationIdForUser(userId);
  if (!organizationId) return null;

  return prisma.accurateCredentials.findFirst({
    where: { id: credentialId, organizationId, disconnectedAt: null },
  });
}

export async function getOperationalPosCredential(
  userId: string,
  permissions: readonly string[] | null | undefined,
  credentialId: string,
) {
  if (!hasPermission(permissions, "pos.catalog.read")) return null;
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
