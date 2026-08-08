import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { getRoleHome, isRoleAllowed, type AppRole } from "@/lib/access-control";
import { prisma } from "@/lib/prisma";

function allowedRoles(request: NextRequest): AppRole[] {
  const path = request.nextUrl.pathname;
  const method = request.method;

  if (path.startsWith("/admin") || path.startsWith("/api/admin")) return ["admin"];

  if (path === "/dashboard") return ["admin"];
  if (
    path.startsWith("/dashboard/analytics") ||
    path.startsWith("/api/analytics") ||
    path.startsWith("/api/dashboard")
  ) return ["admin"];

  if (
    path.startsWith("/dashboard/export") ||
    path.startsWith("/dashboard/import") ||
    path.startsWith("/dashboard/peminjaman") ||
    path.startsWith("/kiosk") ||
    path.startsWith("/api/export") ||
    path.startsWith("/api/import") ||
    path.startsWith("/api/peminjaman") ||
    path.startsWith("/api/self-checkout")
  ) return ["admin", "resource"];

  if (path.startsWith("/dashboard/credentials")) return ["admin"];
  if (path.startsWith("/api/accurate") || path.startsWith("/accurate/callback")) return ["admin"];
  if (path === "/api/credentials") {
    return method === "GET" ? ["admin", "resource", "cashier", "staff"] : ["admin"];
  }

  if (path.startsWith("/dashboard/pos")) return ["admin"];
  if (path.startsWith("/api/pos/settings") || path.startsWith("/api/pos/products/manage")) return ["admin"];
  if (path.startsWith("/pos-cashier")) return ["admin", "cashier"];
  if (path.startsWith("/store")) return ["admin", "staff"];
  if (path.startsWith("/api/pos/reservations")) return ["admin", "cashier", "staff"];
  if (path === "/api/pos/products") return ["admin", "cashier", "staff"];
  if (
    path.startsWith("/api/pos/allowance") ||
    path.startsWith("/api/pos/sales")
  ) return ["admin", "cashier"];

  return ["admin"];
}

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  if (!token) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  const currentUser = token.id
    ? await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { role: true },
      })
    : null;
  const role = currentUser?.role;

  if (!role) {
    if (isApi) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!isRoleAllowed(role, allowedRoles(request))) {
    if (isApi) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.redirect(new URL(getRoleHome(role), request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/dashboard/:path*",
    "/kiosk/:path*",
    "/pos-cashier/:path*",
    "/store/:path*",
    "/accurate/callback",
    "/api/admin/:path*",
    "/api/analytics/:path*",
    "/api/dashboard/:path*",
    "/api/export/:path*",
    "/api/import/:path*",
    "/api/peminjaman/:path*",
    "/api/self-checkout/:path*",
    "/api/pos/:path*",
    "/api/credentials",
    "/api/accurate/:path*",
  ],
};
