import { longAgo, shortAgo } from "@/lib/time-ago";

// The three short lines in the tooltip of the sync dot.
export function syncTooltipLines(
  status: { synced_at: string | null; checked_at: string | null; last_error: string | null },
  now = Date.now(),
) {
  if (status.last_error) return ["Sync is failing", status.last_error, `Last change ${longAgo(status.synced_at, now)}`];
  return [
    "Synced with Central",
    status.checked_at ? `Checked ${shortAgo(status.checked_at, now)}` : "Not checked yet",
    status.synced_at ? `Last change ${longAgo(status.synced_at, now)}` : "Nothing synced yet",
  ];
}

// A fresh check makes the dot pulse once in a while; a failing sync makes it orange.
export function syncDotState(
  status: { checked_at: string | null; last_error: string | null },
  now = Date.now(),
): "ok" | "fresh" | "failing" {
  if (status.last_error) return "failing";
  return status.checked_at && now - new Date(status.checked_at).getTime() < 10_000 ? "fresh" : "ok";
}
