import { NextResponse } from "next/server";
import { hubHomeUrl } from "@/lib/hub-session";

// The login page's button: signing in happens in the Hub.
export async function GET(request: Request) {
  return NextResponse.redirect(hubHomeUrl() ?? new URL("/login?error=sso", request.url));
}
