import { after, NextRequest, NextResponse } from "next/server";
import { BUSY, retryPendingPosSales } from "@/lib/pos-sale-sync";
import { sendPosSaleReceipt } from "@/lib/pos-sale-receipt";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = await retryPendingPosSales();
  // The last run is still going: do not start another one on top of it.
  if (run === BUSY) return NextResponse.json({ attempted: 0, synced: 0, failed: 0, busy: true });

  for (const id of run.syncedIds) after(() => sendPosSaleReceipt(id));
  return NextResponse.json({ attempted: run.attempted, synced: run.synced, failed: run.failed });
}
