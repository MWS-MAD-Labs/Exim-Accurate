import { NextRequest, NextResponse } from "next/server";
import { hubSso } from "@/lib/mws-sso";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  let sso;
  try {
    sso = hubSso();
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
  const cookieName = sso.callback.clearCookie().name;
  const action = sso.callback.decide({ code, state, cookieState: request.cookies.get(cookieName)?.value });
  if (action === "restart") return NextResponse.redirect(new URL("/auth/hub", request.url));
  if (action === "reject" || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  const continueUrl = new URL("/auth/sso/continue", request.url);
  continueUrl.searchParams.set("code", code);
  continueUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(continueUrl);
  const cleared = sso.callback.clearCookie();
  response.cookies.set(cleared.name, "", {
    httpOnly: cleared.httpOnly,
    sameSite: cleared.sameSite,
    path: cleared.path,
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
  });
  return response;
}
