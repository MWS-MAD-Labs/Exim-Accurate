import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getPermissionHome } from "@/lib/access-control";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
  return NextResponse.redirect(new URL(getPermissionHome(session.user.permissions), request.url));
}
