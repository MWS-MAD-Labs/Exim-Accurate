// Sends the permissions Exima understands to Central (Application Access > Permissions).
// The token has to belong to the API client made for Exima, with the
// application_permissions:write scope.
import { errorForNetwork, errorForResponse } from "@/lib/central-errors";

export type PermissionManifestEntry = { key: string; description?: string; requires?: string[] };
export type RegisteredPermission = {
  key: string;
  description: string | null;
  requires: string[];
  source: "MANIFEST" | "MANUAL";
  deprecated: boolean;
};
export type PermissionSyncResult = {
  application_id: string;
  total: number;
  added: number;
  deprecated: string[];
  affected_roles: { role: string; permissions: string[] }[];
};
export type PermissionCheck = {
  notRegistered: string[];
  wouldDrop: string[];
  unknownToCode: string[];
  requiresDiffer: string[];
};

function env(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function call<T>(path: string, init: { method: "GET" | "PUT"; body?: unknown } = { method: "GET" }) {
  const base = env("CENTRAL_DATA_API_BASE_URL").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/api/internal/application-permissions${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${env("CENTRAL_DATA_API_TOKEN")}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (error) {
    throw errorForNetwork(error);
  }
  const body = (await response.json().catch(() => null)) as { data?: T; errors?: string } | null;
  if (!response.ok) throw errorForResponse(response.status, body?.errors);
  return body?.data as T;
}

export function publishPermissions(applicationId: string, permissions: PermissionManifestEntry[], confirmRemovals = false) {
  return call<PermissionSyncResult>(`/${encodeURIComponent(applicationId)}`, {
    method: "PUT",
    body: { permissions, confirm_removals: confirmRemovals || undefined },
  });
}

export function listRegisteredPermissions(applicationId: string) {
  return call<RegisteredPermission[]>(`/${encodeURIComponent(applicationId)}`);
}

export function permissionUsage(applicationId: string) {
  return call<string[]>(`/${encodeURIComponent(applicationId)}/usage`);
}

export function comparePermissions(
  code: PermissionManifestEntry[],
  registered: RegisteredPermission[],
  usage: string[],
): PermissionCheck {
  const inCode = new Set(code.map((entry) => entry.key));
  const current = registered.filter((entry) => !entry.deprecated);
  const same = (left: string[] = [], right: string[] = []) =>
    [...left].sort().join("\n") === [...right].sort().join("\n");
  return {
    notRegistered: code.filter((entry) => !current.some((row) => row.key === entry.key)).map((entry) => entry.key),
    wouldDrop: current.filter((row) => !inCode.has(row.key)).map((row) => row.key),
    unknownToCode: usage.filter((key) => !inCode.has(key)),
    requiresDiffer: code
      .filter((entry) => {
        const row = current.find((candidate) => candidate.key === entry.key);
        return row !== undefined && !same(entry.requires, row.requires);
      })
      .map((entry) => entry.key),
  };
}

// Not registered yet is expected before a deploy, so it is not a failure.
export function permissionCheckFailed(check: PermissionCheck, allowRemovals = false) {
  return (
    check.unknownToCode.length > 0 ||
    check.requiresDiffer.length > 0 ||
    (!allowRemovals && check.wouldDrop.length > 0)
  );
}
