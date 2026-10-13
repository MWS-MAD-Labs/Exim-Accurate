import { hubHomeUrl } from "@/lib/hub-home";
import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import {
  getPermissionHome,
  hasAnyPermission,
  type AppPermission,
} from "@/lib/access-control";
import { prisma } from "@/lib/prisma";

export function requiredPermissions(request: NextRequest): AppPermission[] {
  const path = request.nextUrl.pathname;
  const method = request.method;

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) return ["users.manage"];
  if (path === "/dashboard") return ["dashboard.read"];
  if (path.startsWith("/dashboard/analytics") || path.startsWith("/api/analytics") || path.startsWith("/api/dashboard")) return ["analytics.read", "dashboard.read"];
  if (path.startsWith("/dashboard/export") || path.startsWith("/api/export")) return ["inventory.export"];
  if (path.startsWith("/dashboard/import") || path.startsWith("/api/import")) return ["inventory.import"];
  if (path.startsWith("/dashboard/peminjaman") || path.startsWith("/kiosk") || path.startsWith("/api/peminjaman") || path.startsWith("/api/self-checkout")) return ["borrowing.manage"];
  if (path.startsWith("/dashboard/credentials")) return ["credentials.manage"];
  if (path.startsWith("/api/accurate") || path.startsWith("/accurate/callback")) return ["accurate.manage"];
  if (path === "/api/credentials") return method === "GET" ? ["credentials.read"] : ["credentials.manage"];
  if (path.startsWith("/dashboard/pos")) return ["pos.manage", "analytics.read"];
  if (path.startsWith("/api/pos/settings") || path.startsWith("/api/pos/products/manage") || path.startsWith("/api/pos/restock-proposal")) return ["pos.manage"];
  if (path.startsWith("/pos-cashier")) return ["pos.checkout"];
  if (path.startsWith("/store")) return ["store.use"];
  if (path.startsWith("/api/pos/reservations")) return ["pos.checkout", "store.use"];
  if (path === "/api/pos/products") return ["pos.catalog.read"];
  if (path.startsWith("/api/pos/allowance")) return ["allowance.manage", "allowance.collect", "pos.checkout"];
  if (path.startsWith("/api/pos/sales")) return ["pos.sales.read", "pos.checkout"];
  if (path.startsWith("/api/pos/staff")) return ["pos.checkout"];
  if (path.startsWith("/api/pos/my-transactions")) return ["store.use"];

  return [];
}

export async function proxy(request: NextRequest) {
  // The sign-in page is the Hub. It only shows here to explain why a sign-in failed.
  if (request.nextUrl.pathname === "/login") {
    const hub = hubHomeUrl();
    return hub && !request.nextUrl.searchParams.has("error") ? NextResponse.redirect(hub) : NextResponse.next();
  }
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  if (!token?.id) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const hub = hubHomeUrl();
    if (hub) return NextResponse.redirect(hub);
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: token.id as string },
    select: { permissions: true, sessionVersion: true },
  });
  if (!currentUser || currentUser.sessionVersion !== token.sessionVersion) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login?error=revoked", request.url));
  }

  const required = requiredPermissions(request);
  if (required.length === 0 || !hasAnyPermission(currentUser.permissions, required)) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL(getPermissionHome(currentUser.permissions), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login", "/admin/:path*", "/dashboard/:path*", "/kiosk/:path*", "/pos-cashier/:path*", "/store/:path*",
    "/accurate/callback", "/api/admin/:path*", "/api/analytics/:path*", "/api/dashboard/:path*",
    "/api/export/:path*", "/api/import/:path*", "/api/peminjaman/:path*", "/api/self-checkout/:path*",
    "/api/pos/:path*", "/api/credentials", "/api/accurate/:path*",
  ],
};
