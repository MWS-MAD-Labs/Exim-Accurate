import { NextRequest, NextResponse } from "next/server";
import { syncIfChanged } from "@/lib/central-user-sync";

export const maxDuration = 120;

// Called every minute by the scheduler. Cheap when nothing changed: one short key from Central.
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncIfChanged();
  if (result.status === "error") console.error("[users] auto sync failed", result.message);
  return NextResponse.json(result);
}
