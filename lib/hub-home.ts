import { hubSso } from "@/lib/mws-sso";

// The Hub front page, where people pick an app. Null when the Hub is not configured.
export function hubHomeUrl(): string | null {
  try {
    return hubSso().homeUrl();
  } catch {
    return null;
  }
}
