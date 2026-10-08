import { NextResponse } from "next/server";

export async function GET() {
  const response = new NextResponse(null, {
    status: 204,
    headers: {
      "cache-control": "private, no-store",
      "content-security-policy": process.env.HUB_BASE_URL
        ? `frame-ancestors 'self' ${process.env.HUB_BASE_URL}`
        : "frame-ancestors 'self'",
    },
  });

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
