import { NextRequest, NextResponse } from "next/server";
import { hubHomeUrl } from "@/lib/hub-session";

// Exima has no sign-out of its own. Signing out lives on the Hub front page and ends every app at once.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(hubHomeUrl() ?? new URL("/login", request.url));
}
