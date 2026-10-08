import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getHubLogoutUrl } from "@/lib/mws-sso";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const returnUrl = new URL("/login", request.url).toString();
  const destination = session?.user?.email
    ? getHubLogoutUrl(session.user.email, returnUrl)
    : returnUrl;
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
