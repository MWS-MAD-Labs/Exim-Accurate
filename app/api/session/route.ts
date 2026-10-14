import { headers } from "next/headers";
import { hubSession } from "@/lib/hub-session";
import { CentralUnavailableError, resolveSessionUser } from "@/lib/session";

// The signed-in person, for the pages. 401 without a Hub session, 403 when Central gave no access to Exima.
export async function GET() {
  const hub = hubSession();
  const claims = await hub.fromCookieHeader((await headers()).get("cookie"));
  if (!claims) return Response.json({ error: "Not signed in" }, { status: 401 });

  let user;
  try {
    user = await resolveSessionUser(claims);
  } catch (error) {
    if (error instanceof CentralUnavailableError) return Response.json({ error: "Try again shortly" }, { status: 503 });
    throw error;
  }
  if (!user) return Response.json({ error: "No access to Exima" }, { status: 403 });

  return Response.json({
    user,
    hub: { homeUrl: hub.homeUrl(), refreshUrl: hub.refreshUrl() },
    expiresIn: Math.max(claims.exp - Math.floor(Date.now() / 1000), 0),
  });
}
