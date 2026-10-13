import { NextResponse } from "next/server";
import { hubSso } from "@/lib/mws-sso";
import { prisma } from "@/lib/prisma";

// The Hub calls this when a person signed out of another app, or this application was retired.
export async function POST(request: Request) {
  let sso;
  try {
    sso = hubSso();
  } catch {
    return NextResponse.json({ revoked: false }, { status: 503 });
  }
  const result = await sso.revoke.handle({
    secret: request.headers.get("x-hub-internal-secret"),
    body: await request.json().catch(() => null),
    apply: async ({ personId, email, all }) => {
      const where = all ? {} : personId ? { centralPersonId: personId } : { email: email!.trim().toLowerCase() };
      const updated = await prisma.user.updateMany({ where, data: { sessionVersion: { increment: 1 } } });
      return updated.count > 0;
    },
  });
  return NextResponse.json(result.body, { status: result.status });
}
