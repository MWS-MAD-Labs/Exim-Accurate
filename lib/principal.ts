import { getServerSession } from "@/lib/session";
import { hasPermission, type AppPermission } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";

export async function getCurrentPrincipal() {
  const session = await getServerSession();
  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      centralPersonId: true,
      centralEntitlementId: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      organizationId: true,
      entitlementVersion: true,
      sessionVersion: true,
    },
  });
}

export async function getPrincipalWithPermission(permission: AppPermission) {
  const principal = await getCurrentPrincipal();
  return principal && hasPermission(principal.permissions, permission) ? principal : null;
}
