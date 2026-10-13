import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hubSso } from "@/lib/mws-sso";

// Clears this app's session, then sends the browser to the Hub, in the same tab. The Hub ends the person's
// sessions in the other apps, keeps its own, and shows its front page.
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  let destination = new URL("/login", request.url).toString();
  try {
    destination = hubSso().logoutUrl(session?.user?.email ?? undefined);
  } catch {
    // Hub not configured: the login page is the only place to go.
  }

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
