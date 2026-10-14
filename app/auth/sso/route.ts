import { NextRequest, NextResponse } from "next/server";
import { getPermissionHome } from "@/lib/access-control";
import { hubSession } from "@/lib/hub-session";
import { CentralUnavailableError, sessionFromCookieHeader } from "@/lib/session";
import { getBaseUrl } from "@/lib/url";

// Where the Hub's card opens Exima. There is nothing to sign in to: the Hub's session is read from its cookie.
// This only sends the person to the page their role starts on, or asks the Hub to restore the session first.
export async function GET(request: NextRequest) {
  const hub = hubSession();
  let result;
  try {
    result = await sessionFromCookieHeader(request.headers.get("cookie"));
  } catch (error) {
    if (!(error instanceof CentralUnavailableError)) throw error;
    return NextResponse.redirect(new URL("/login?error=UPSTREAM_UNREACHABLE", request.url));
  }

  if (!result.claims) {
    const here = new URL("/auth/sso", getBaseUrl(request)).toString();
    const step = hub.step({ claims: null, restored: request.nextUrl.searchParams.has("restored") });
    return NextResponse.redirect(step === "restore" ? hub.restoreUrl(here) : hub.homeUrl());
  }
  if (!result.user) return NextResponse.redirect(new URL("/login?error=no_access", request.url));
  return NextResponse.redirect(new URL(getPermissionHome(result.user.permissions), request.url));
}
