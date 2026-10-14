import { headers } from "next/headers";
import type { HubSessionClaims } from "mws-central-auth/server";
import { resolveAccess } from "@/lib/central-access";
import { hubSession } from "@/lib/hub-session";
import { prisma } from "@/lib/prisma";
import { parseEntitlement, projectEmployee } from "@/lib/user-projection";

// Exima has no sign-in or sign-out of its own. The Hub's session (a short access token in a cookie on the parent
// domain) says who the person is; Central says what they may do here; the local account is kept to match.

export interface SessionUser {
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

export interface Session {
  user: SessionUser;
}

// Central could not be asked: the caller should tell the person to try again, not that they have no access.
export class CentralUnavailableError extends Error {}

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  permissions: true,
  organizationId: true,
  centralEntitlementId: true,
  entitlementVersion: true,
  centralPersonId: true,
  sessionVersion: true,
  centralStatus: true,
} as const;

// The local account of the person behind a verified Hub token, or null when Central gave them no access to Exima.
export async function resolveSessionUser(claims: Pick<HubSessionClaims, "sub" | "email" | "source">): Promise<SessionUser | null> {
  if (claims.source !== "employee") return null;

  const access = await resolveAccess({ email: claims.email, personId: claims.sub });
  if (access.status === "central_unavailable") throw new CentralUnavailableError("Central could not be asked");

  // Accounts that always get in (a wrong Central setup must not lock everybody out) keep what they have.
  if (access.status === "bypass") {
    const kept = await prisma.user.findUnique({ where: { centralPersonId: claims.sub }, select: userSelect });
    return kept && kept.centralStatus !== "no_access" ? kept : null;
  }
  if (access.status !== "granted" || !access.entitlement) return null;

  const existing = await prisma.user.findUnique({ where: { centralPersonId: claims.sub }, select: userSelect });

  const entitlement = parseEntitlement(access.entitlement);
  const current =
    existing &&
    existing.centralStatus === "active" &&
    existing.role === entitlement.role &&
    existing.entitlementVersion === entitlement.version &&
    existing.permissions.length === entitlement.permissions.length &&
    existing.permissions.every((permission) => entitlement.permissions.includes(permission as never));
  if (current) return existing;

  await projectEmployee({ id: claims.sub, email: claims.email }, entitlement);
  return prisma.user.findUnique({ where: { centralPersonId: claims.sub }, select: userSelect });
}

// Who is behind a request's Cookie header, or null.
export async function sessionFromCookieHeader(cookie: string | null | undefined): Promise<{
  claims: HubSessionClaims | null;
  user: SessionUser | null;
}> {
  const claims = await hubSession().fromCookieHeader(cookie);
  if (!claims) return { claims: null, user: null };
  return { claims, user: await resolveSessionUser(claims) };
}

// For route handlers, pages and layouts: the signed-in person, or null.
export async function getServerSession(): Promise<Session | null> {
  const { user } = await sessionFromCookieHeader((await headers()).get("cookie"));
  return user ? { user } : null;
}

