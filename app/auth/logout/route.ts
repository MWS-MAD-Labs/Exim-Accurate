import { NextResponse } from "next/server";
import { hubHomeUrl } from "@/lib/hub-home";

export async function GET(request: Request) {
  // Only this app's session ends. The Hub stays signed in and is where the person picks an app again.
  const destination = hubHomeUrl() ?? new URL("/login", request.url).toString();
  const response = NextResponse.redirect(destination);
  for (const name of ["next-auth.session-token", "__Secure-next-auth.session-token"]) {
    response.cookies.set(name, "", {
      path: "/",
      expires: new Date(0),
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-") || process.env.NODE_ENV === "production",
    });
  }
  return response;
}
