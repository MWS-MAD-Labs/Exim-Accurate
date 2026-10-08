import { NextResponse } from "next/server";
import { getPrincipalWithPermission } from "@/lib/principal";
import { prisma } from "@/lib/prisma";
import { SYNC_APPLICATION_ID, syncIfChanged, syncUsersFromCentral } from "@/lib/central-user-sync";

// How the automatic sync is doing: read from the database, no call to Central.
export async function GET() {
  const admin = await getPrincipalWithPermission("users.manage");
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const state = await prisma.centralSyncState.findUnique({ where: { application: SYNC_APPLICATION_ID() } });
  return NextResponse.json({
    status: {
      synced_at: state?.syncedAt.toISOString() ?? null,
      checked_at: state?.checkedAt?.toISOString() ?? null,
      last_error: state?.lastError ?? null,
      summary: state?.lastSummary ?? null,
    },
  });
}

// Retry by hand, for when the automatic sync reports an error.
export async function POST() {
  const admin = await getPrincipalWithPermission("users.manage");
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  try {
    const result = await syncIfChanged();
    if (result.status === "error") throw new Error(result.message);
    if (result.status === "synced") return NextResponse.json({ result: "synced", summary: result.summary });
    if (result.status === "unavailable") throw new Error("Central could not be reached");
    return NextResponse.json({ result: result.status });
  } catch (error) {
    console.error("[users] manual sync failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Central could not be reached. Try again in a moment." }, { status: 502 });
  }
}

// Forces a full read even when Central says nothing changed.
export async function PUT() {
  const admin = await getPrincipalWithPermission("users.manage");
  if (!admin) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  try {
    return NextResponse.json({ result: "synced", summary: await syncUsersFromCentral() });
  } catch (error) {
    console.error("[users] full sync failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Central could not be reached. Try again in a moment." }, { status: 502 });
  }
}
