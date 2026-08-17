import { after, NextResponse } from "next/server";
import { sendPosAllowanceCutoffNotifications } from "@/lib/pos-allowance-notifications";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  after(async () => {
    try {
      const result = await sendPosAllowanceCutoffNotifications();
      if (result.failed > 0 || result.storesFailed > 0) {
        console.error("[pos-allowance-notifications] Background run completed with failures", result);
      } else {
        console.info("[pos-allowance-notifications] Background run completed", result);
      }
    } catch (error) {
      console.error("[pos-allowance-notifications] Fatal background run error", error);
    }
  });

  return NextResponse.json({
    success: true,
    message: "POS allowance notification run triggered. Processing in background.",
    triggeredAt: new Date().toISOString(),
  }, { status: 202 });
}
