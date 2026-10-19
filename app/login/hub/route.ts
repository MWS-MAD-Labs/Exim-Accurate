import { NextRequest, NextResponse } from "next/server";
import { hubHomeUrl } from "@/lib/hub-session";
import { getBaseUrl } from "@/lib/url";

// The login page's button: signing in happens in the Hub.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(hubHomeUrl() ?? new URL("/login?error=sso", getBaseUrl(request)));
}
