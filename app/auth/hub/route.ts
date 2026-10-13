import { NextResponse } from "next/server";
import { hubSso } from "@/lib/mws-sso";

export async function GET(request: Request) {
  try {
    const { url, cookie } = hubSso().launch.begin();
    const response = NextResponse.redirect(url);
    response.cookies.set(cookie.name, cookie.value, {
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      path: cookie.path,
      maxAge: cookie.maxAgeSeconds,
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return NextResponse.redirect(new URL("/login?error=sso", request.url));
  }
}
