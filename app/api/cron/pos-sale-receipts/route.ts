import { after, NextResponse } from "next/server";
import { retryPosSaleReceipts } from "@/lib/pos-sale-receipt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      const result = await retryPosSaleReceipts({ limit: 100 });
      if (result.failed > 0) {
        console.error("[pos-sale-receipt] Scheduled retry completed with failures", result);
      } else {
        console.info("[pos-sale-receipt] Scheduled retry completed", result);
      }
    } catch (error) {
      console.error("[pos-sale-receipt] Fatal scheduled retry error", error);
    }
  });

  return NextResponse.json(
    {
      success: true,
      message: "POS sale receipt retry triggered. Processing in background.",
      triggeredAt: new Date().toISOString(),
    },
    { status: 202 },
  );
}
