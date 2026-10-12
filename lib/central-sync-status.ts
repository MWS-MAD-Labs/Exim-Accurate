// Whether the people in Exima still match what Central has. Central gives one short key that
// changes only when something Exima keeps about a person changes, so a page view asks for that
// key (at most every few minutes) instead of the whole list.
import { centralConnection } from "@/lib/central-config";
import { errorForNetwork, errorForResponse, type CentralFailure } from "@/lib/central-errors";

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

export type KeyResult = { key: string } | { failure: CentralFailure; message: string };

export async function fetchCentralKeyResult(applicationId: string, maxAgeMs = CHECK_MS): Promise<KeyResult> {
  if (maxAgeMs > 0 && known && Date.now() - known.at < maxAgeMs) return { key: known.key };
  const connection = centralConnection();
  if (!connection) return { failure: "rejected", message: "Central API is not configured" };
  const { base, token } = connection;
  try {
    const url = new URL(`${base}/application-entitlements/version`);
    url.searchParams.set("application_id", applicationId);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as { data?: { key?: string }; errors?: string } | null;
    if (!response.ok) {
      const failure = errorForResponse(response.status, body?.errors);
      return { failure: failure.kind, message: failure.message };
    }
    if (!body?.data?.key) return { failure: "rejected", message: "Central answered without a version key" };
    rememberCentralKey(body.data.key);
    return { key: body.data.key };
  } catch (error) {
    const failure = errorForNetwork(error);
    return { failure: failure.kind, message: failure.message };
  }
}

export async function fetchCentralKey(applicationId: string, maxAgeMs = CHECK_MS): Promise<string | null> {
  const result = await fetchCentralKeyResult(applicationId, maxAgeMs);
  return "key" in result ? result.key : null;
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
