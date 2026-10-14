import { NextRequest, NextResponse } from "next/server";
import {
  getPermissionHome,
  hasAnyPermission,
  type AppPermission,
} from "@/lib/access-control";
import { hubSession } from "@/lib/hub-session";
import { CentralUnavailableError, resolveSessionUser } from "@/lib/session";
import { getBaseUrl } from "@/lib/url";

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
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const hub = hubSession();

  // The login page only shows why a visit did not work. Without a reason it goes to the Hub.
  if (request.nextUrl.pathname === "/login") {
    return request.nextUrl.searchParams.has("error") ? NextResponse.next() : NextResponse.redirect(hub.homeUrl());
  }

  const claims = await hub.fromCookieHeader(request.headers.get("cookie"));
  if (!claims) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // The Hub gives the session back when the person still has one, or shows its front page.
    const here = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, getBaseUrl(request)).toString();
    const step = hub.step({ claims: null, restored: request.nextUrl.searchParams.has("restored") });
    return NextResponse.redirect(step === "restore" ? hub.restoreUrl(here) : hub.homeUrl());
  }

  let user;
  try {
    user = await resolveSessionUser(claims);
  } catch (error) {
    if (!(error instanceof CentralUnavailableError)) throw error;
    if (isApi) return NextResponse.json({ error: "Try again shortly" }, { status: 503 });
    return NextResponse.redirect(new URL("/login?error=UPSTREAM_UNREACHABLE", request.url));
  }
  if (!user) {
    if (isApi) return NextResponse.json({ error: "No access to Exima" }, { status: 403 });
    return NextResponse.redirect(new URL("/login?error=no_access", request.url));
  }

  const required = requiredPermissions(request);
  if (required.length === 0 || !hasAnyPermission(user.permissions, required)) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL(getPermissionHome(user.permissions), request.url));
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
