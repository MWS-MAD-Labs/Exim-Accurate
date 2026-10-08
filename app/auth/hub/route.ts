import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getHubLaunchUrl } from "@/lib/mws-sso";

export async function GET(request: Request) {
  try {
    const initiationNonce = randomUUID();
    const response = NextResponse.redirect(getHubLaunchUrl(initiationNonce));
    response.cookies.set("exima.sso-state", initiationNonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/sso",
      maxAge: 300,
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
}
