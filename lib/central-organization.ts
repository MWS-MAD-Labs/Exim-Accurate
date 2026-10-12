// Finds the local organization for the one Central names. A deployment set up with CENTRAL_ORGANIZATION_ID
// (from the .env block Central gives) maps its own organization the first time it is needed, so nobody has to
// run db:map-central-organization by hand.
type OrganizationDb = {
  organization: {
    findUnique(args: { where: { centralOrganizationId: string }; select: { id: true } }): Promise<{ id: string } | null>;
    findMany(args: { where: { centralOrganizationId: null }; select: { id: true }; take: number }): Promise<{ id: string }[]>;
    count(): Promise<number>;
    create(args: { data: { name: string; centralOrganizationId: string }; select: { id: true } }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: { centralOrganizationId: string }; select: { id: true } }): Promise<{ id: string }>;
  };
};

const find = (db: OrganizationDb, centralOrganizationId: string) =>
  db.organization.findUnique({ where: { centralOrganizationId }, select: { id: true } });

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

export function configuredCentralOrganization() {
  return process.env.CENTRAL_ORGANIZATION_ID?.trim() || null;
}

export async function resolveCentralOrganization(db: OrganizationDb, centralOrganizationId: string): Promise<{ id: string } | null> {
  const mapped = await find(db, centralOrganizationId);
  if (mapped) return mapped;
  // Only the organization this deployment was set up for is mapped on its own.
  if (configuredCentralOrganization() !== centralOrganizationId) return null;

  try {
    const total = await db.organization.count();
    if (total === 0) {
      return await db.organization.create({ data: { name: "Exima", centralOrganizationId }, select: { id: true } });
    }
    const unmapped = await db.organization.findMany({ where: { centralOrganizationId: null }, select: { id: true }, take: 2 });
    // Several organizations, or ones already mapped elsewhere, are left to the script.
    if (total === 1 && unmapped.length === 1) {
      return await db.organization.update({ where: { id: unmapped[0]!.id }, data: { centralOrganizationId }, select: { id: true } });
    }
    return null;
  } catch (error) {
    // Another sign-in mapped it at the same moment.
    if (isUniqueConflict(error)) return find(db, centralOrganizationId);
    throw error;
  }
}

// Why an organization could not be used, in words for the log.
export function organizationProblem(centralOrganizationId: string) {
  const configured = configuredCentralOrganization();
  if (configured && configured !== centralOrganizationId) {
    return `Central organization ${centralOrganizationId} is not the one this Exima is set up for (CENTRAL_ORGANIZATION_ID is ${configured})`;
  }
  return "Central organization is not mapped in Exima. Run npm run db:map-central-organization, or set CENTRAL_ORGANIZATION_ID";
}
