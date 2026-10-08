import "next-auth";

declare module "next-auth" {
  interface User {
    id: string;
    email: string;
    name: string | null;
    role: string;
    permissions: string[];
    organizationId: string;
    centralEntitlementId: string | null;
    entitlementVersion: number;
    centralPersonId: string | null;
    sessionVersion: number;
  }

  interface Session {
    user: User;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    name: string | null;
    role: string;
    permissions: string[];
    organizationId: string;
    centralEntitlementId: string | null;
    entitlementVersion: number;
    centralPersonId: string | null;
    sessionVersion: number;
  }
}
