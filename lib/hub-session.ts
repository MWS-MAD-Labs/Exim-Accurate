import { createHubSession } from "mws-central-auth/server";

export function hubSession() {
  const base = process.env.HUB_BASE_URL?.trim();
  if (!base) throw new Error("HUB_BASE_URL is not set");
  return createHubSession({ hubBaseUrl: base });
}

// The Hub front page, or null when the Hub is not configured.
export function hubHomeUrl(): string | null {
  try {
    return hubSession().homeUrl();
  } catch {
    return null;
  }
}
