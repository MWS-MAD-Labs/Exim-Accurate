import { NextResponse } from "next/server";
import {
  HubInternalRequestVerificationError,
  parseHubRevocationPayload,
  verifyHubInternalSecret,
} from "mws-central-auth/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const secret = process.env.HUB_INTERNAL_SECRET;
  if (!secret || !verifyHubInternalSecret(request.headers.get("x-hub-internal-secret"), secret)) {
    return NextResponse.json({ revoked: false }, { status: 401 });
  }

  try {
    const payload = parseHubRevocationPayload(await request.json().catch(() => null));
    if (!payload.central_id) {
      return NextResponse.json({ revoked: false }, { status: 400 });
    }
    const result = await prisma.user.updateMany({
      where: { centralPersonId: payload.central_id },
      data: { sessionVersion: { increment: 1 } },
    });
    return NextResponse.json({ revoked: result.count > 0 });
  } catch (error) {
    if (error instanceof HubInternalRequestVerificationError) {
      return NextResponse.json({ revoked: false }, { status: 400 });
    }
    return NextResponse.json({ revoked: false }, { status: 503 });
  }
}
