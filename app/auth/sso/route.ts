import { NextResponse } from "next/server";
import { ssoCallbackAction } from "@/lib/sso-callback";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const initiationNonce = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("exima.sso-state="))
    ?.slice("exima.sso-state=".length);

  const action = ssoCallbackAction({
    code,
    state,
    nonce: initiationNonce ? decodeURIComponent(initiationNonce) : null,
  });
  if (action === "restart") return NextResponse.redirect(new URL("/auth/hub", request.url));
  if (action === "reject" || !code || !state) {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }

  const continueUrl = new URL("/auth/sso/continue", request.url);
  continueUrl.searchParams.set("code", code);
  continueUrl.searchParams.set("state", state);
  const response = NextResponse.redirect(continueUrl);
  response.cookies.set("exima.sso-state", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/sso",
    expires: new Date(0),
  });
  return response;
}
