// How Exima reaches Central. Every application gets the same lines from Central: CENTRAL_API_BASE_URL (already ending
// in /api/internal) and CENTRAL_API_TOKEN. The older CENTRAL_DATA_API_* names are still read until the .env is replaced.
function clean(name: string) {
  return process.env[name]?.trim() || null;
}

// The address of Central's internal API, without a trailing slash and ending in /api/internal.
export function centralApiBase(): string | null {
  const current = clean("CENTRAL_API_BASE_URL");
  if (current) return current.replace(/\/+$/, "");
  const old = clean("CENTRAL_DATA_API_BASE_URL");
  return old ? `${old.replace(/\/+$/, "")}/api/internal` : null;
}

export function centralApiToken(): string | null {
  return clean("CENTRAL_API_TOKEN") ?? clean("CENTRAL_DATA_API_TOKEN");
}

// The headers of a call to Central. The Organization ID from the .env goes with it, so Central can show whether it is the
// one it made for this application.
export function centralAuthHeaders(token: string): Record<string, string> {
  const organization = clean("CENTRAL_ORGANIZATION_ID");
  return { authorization: `Bearer ${token}`, ...(organization ? { "x-central-organization-id": organization } : {}) };
}

// Both, or null when either is missing.
export function centralConnection(): { base: string; token: string } | null {
  const base = centralApiBase();
  const token = centralApiToken();
  return base && token ? { base, token } : null;
}
