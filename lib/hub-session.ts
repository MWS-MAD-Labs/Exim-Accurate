import { createHubSession } from "mws-central-auth/server";

// The name of the Hub's access cookie. Staging and production Hubs share a parent domain, so each environment sets its
// own (for example hub_at_stg) and the cookies stop overwriting each other. Unset means the Hub's default, hub_at.
export function accessCookieName(): string | undefined {
  return process.env.HUB_ACCESS_COOKIE_NAME?.trim() || undefined;
}

export function hubSession() {
  const base = process.env.HUB_BASE_URL?.trim();
  if (!base) throw new Error("HUB_BASE_URL is not set");
  return createHubSession({ hubBaseUrl: base, cookieName: accessCookieName() });
}

// The Hub front page, or null when the Hub is not configured.
export function hubHomeUrl(): string | null {
  try {
    return hubSession().homeUrl();
  } catch {
    return null;
  }
}
