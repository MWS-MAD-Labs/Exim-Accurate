// Whether the people in Exima still match what Central has. Central gives one short key that
// changes only when something Exima keeps about a person changes, so a page view asks for that
// key (at most every few minutes) instead of the whole list.
const CHECK_MS = 5 * 60_000;

let known: { key: string; at: number } | null = null;

export function rememberCentralKey(key: string) {
  known = { key, at: Date.now() };
}

export function clearCentralKeyForTest() {
  known = null;
}

export type SyncStatus = {
  synced_key: string | null;
  central_key: string | null;
  synced_at: string | null;
  // False when Central could not be asked; nothing is claimed about changes then.
  central_available: boolean;
  changed: boolean;
};

// Never synced counts as changed. Unknown key (Central unreachable) counts as not changed.
export function isChanged(syncedKey: string | null, centralKey: string | null) {
  if (!centralKey) return false;
  return syncedKey !== centralKey;
}

export async function fetchCentralKey(applicationId: string, maxAgeMs = CHECK_MS): Promise<string | null> {
  if (maxAgeMs > 0 && known && Date.now() - known.at < maxAgeMs) return known.key;
  const base = process.env.CENTRAL_DATA_API_BASE_URL?.trim().replace(/\/$/, "");
  const token = process.env.CENTRAL_DATA_API_TOKEN?.trim();
  if (!base || !token) return null;
  try {
    const url = new URL(`${base}/api/internal/application-entitlements/version`);
    url.searchParams.set("application_id", applicationId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { data?: { key?: string } } | null;
    if (!response.ok || !body?.data?.key) return null;
    rememberCentralKey(body.data.key);
    return body.data.key;
  } catch {
    return null;
  }
}

export function buildStatus(
  state: { key: string; syncedAt: Date } | null,
  centralKey: string | null,
): SyncStatus {
  return {
    synced_key: state?.key ?? null,
    central_key: centralKey,
    synced_at: state?.syncedAt.toISOString() ?? null,
    central_available: centralKey !== null,
    changed: isChanged(state?.key ?? null, centralKey),
  };
}
