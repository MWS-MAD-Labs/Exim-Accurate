import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { hubHomeUrl } from "@/lib/hub-home";
import { notifyHubAppLogout } from "@/lib/mws-sso";

export async function GET(request: Request) {
  // The Hub ends this person's sessions in the other apps. The Hub's own session stays.
  const session = await getServerSession(authOptions);
  if (session?.user?.email && session.user.centralPersonId) {
    await notifyHubAppLogout(session.user.email, session.user.centralPersonId);
  }

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
