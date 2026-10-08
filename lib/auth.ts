import { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import { authenticateHubCode } from "./mws-sso";
import { decideSession, eximaAccessMode, resolveAccess } from "./central-access";
import { normalizePermissions } from "./access-control";

type ProjectedUser = {
  email: string;
  role: string;
  permissions: string[];
  entitlementVersion: number;
  centralPersonId: string | null;
  sessionVersion: number;
};

// Asks Central again whether this person still has access and what role they hold.
// Returns true when the session has to end. A role change is written to the account
// and the session keeps going on the new version.
async function refreshFromCentral(token: JWT, user: ProjectedUser) {
  const mode = eximaAccessMode();
  if (mode === "off" || !user.centralPersonId) return false;

  const access = await resolveAccess({ email: user.email, personId: user.centralPersonId });
  const decision = decideSession(mode, access, user);
  if (mode === "warn" && (access.status === "no_access" || access.status === "no_permission")) {
    console.warn(`[access] Exima access would be removed: ${user.email} (${access.status})`);
  }
  if (decision === "end") return true;
  if (decision === "update" && access.entitlement) {
    // The session goes on: permissions are read from the database on every request.
    await prisma.user.update({
      where: { id: token.id as string },
      data: {
        role: access.entitlement.role.toLowerCase(),
        permissions: normalizePermissions(access.entitlement.permissions),
        entitlementVersion: access.entitlement.version,
        entitlementSyncedAt: new Date(),
      },
    });
    user.role = access.entitlement.role.toLowerCase();
    user.permissions = normalizePermissions(access.entitlement.permissions);
    user.entitlementVersion = access.entitlement.version;
  }
  return false;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "hub-sso",
      name: "MWS Hub",
      credentials: {
        code: { label: "Hub SSO code", type: "text" },
        state: { label: "Hub SSO state", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.code || !credentials.state) return null;

        try {
          const user = await authenticateHubCode(credentials.code, credentials.state);
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            permissions: user.permissions,
            organizationId: user.organizationId,
            centralEntitlementId: user.centralEntitlementId,
            entitlementVersion: user.entitlementVersion,
            centralPersonId: user.centralPersonId,
            sessionVersion: user.sessionVersion,
          };
        } catch (error) {
          console.error("[auth] Hub SSO failed", {
            errorName: error instanceof Error ? error.name : "UnknownError",
            reason: error instanceof Error ? error.message.split("\n")[0] : undefined,
          });
          return null;
        }
      },
    }),
    // Direct Google and password providers are intentionally disabled during
    // the Hub SSO rollout. Hub is the only interactive authentication entry.
  ],
  session: {
    strategy: "jwt",
    maxAge: 15 * 60,
  },
  jwt: {
    maxAge: 15 * 60,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.permissions = user.permissions;
        token.organizationId = user.organizationId;
        token.centralEntitlementId = user.centralEntitlementId;
        token.entitlementVersion = user.entitlementVersion;
        token.centralPersonId = user.centralPersonId;
        token.sessionVersion = user.sessionVersion;
      } else if (token.id) {
        const currentUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            email: true,
            name: true,
            role: true,
            permissions: true,
            organizationId: true,
            centralEntitlementId: true,
            entitlementVersion: true,
            centralPersonId: true,
            sessionVersion: true,
          },
        });
        if (!currentUser || currentUser.sessionVersion !== token.sessionVersion) {
          token.id = "";
          token.role = "";
          token.centralPersonId = null;
          token.permissions = [];
        } else if (await refreshFromCentral(token, currentUser)) {
          token.id = "";
          token.role = "";
          token.centralPersonId = null;
          token.permissions = [];
        } else {
          token.email = currentUser.email;
          token.name = currentUser.name;
          token.role = currentUser.role;
          token.centralPersonId = currentUser.centralPersonId;
          token.permissions = currentUser.permissions;
          token.organizationId = currentUser.organizationId;
          token.centralEntitlementId = currentUser.centralEntitlementId;
          token.entitlementVersion = currentUser.entitlementVersion;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null;
        session.user.role = token.role as string;
        session.user.permissions = token.permissions as string[];
        session.user.organizationId = token.organizationId as string;
        session.user.centralEntitlementId = token.centralEntitlementId as string | null;
        session.user.entitlementVersion = token.entitlementVersion as number;
        session.user.centralPersonId = token.centralPersonId as string | null;
        session.user.sessionVersion = token.sessionVersion as number;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
