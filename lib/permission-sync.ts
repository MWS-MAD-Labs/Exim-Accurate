import { PERMISSION_MANIFEST } from "@/lib/access-control";
import { CentralError, errorForNetwork } from "@/lib/central-errors";
import {
  comparePermissions,
  listRegisteredPermissions,
  permissionUsage,
  publishPermissions,
  type PermissionManifestEntry,
} from "@/lib/central-permissions";

// A new deploy tells Central which permissions this version of the code understands, so roles
// in Central can only carry those. It runs when the server starts: the production image has no
// dev tools (npm run permissions:sync cannot run there), and a new container is a new deploy.
const APPLICATION_ID = () => process.env.HUB_SSO_APP_ID?.trim() || "exima";

export function permissionSyncEnabled() {
  return (process.env.EXIMA_PERMISSION_SYNC ?? "on").trim().toLowerCase() !== "off";
}

type Deps = {
  list: typeof listRegisteredPermissions;
  usage: typeof permissionUsage;
  publish: typeof publishPermissions;
  sleep: (ms: number) => Promise<void>;
  log: Pick<Console, "info" | "warn" | "error">;
};

const defaults: Deps = {
  list: listRegisteredPermissions,
  usage: permissionUsage,
  publish: publishPermissions,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log: console,
};

export type PermissionSyncOutcome = "in_sync" | "published" | "refused" | "unreachable" | "off";

// Still waiting to be sent: Central was not reachable, or has not been deployed with this yet.
// The automatic sync asks again every minute until it works.
let pending = true;

export function permissionsPending() {
  return pending;
}

export function resetPermissionsPendingForTest() {
  pending = true;
}

export async function syncPermissionsOnBoot(
  manifest: PermissionManifestEntry[] = PERMISSION_MANIFEST,
  deps: Partial<Deps> = {},
  attempts = 3,
): Promise<PermissionSyncOutcome> {
  const d = { ...defaults, ...deps };
  if (!permissionSyncEnabled()) {
    pending = false;
    return "off";
  }
  const application = APPLICATION_ID();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [registered, usage] = await Promise.all([d.list(application), d.usage(application)]);
      const check = comparePermissions(manifest, registered, usage);
      if (check.notRegistered.length === 0 && check.wouldDrop.length === 0 && check.requiresDiffer.length === 0) {
        pending = false;
        return "in_sync";
      }
      // Never confirms removals: Central refuses a list that would drop permissions roles still carry.
      const result = await d.publish(application, manifest, false);
      d.log.info(`[permissions] Sent to Central: ${result.total} total, ${result.added} new`);
      if (result.affected_roles.length > 0) {
        d.log.warn(`[permissions] Roles still carry dropped permissions: ${result.affected_roles.map((role) => role.role).join(", ")}`);
      }
      pending = false;
      return "published";
    } catch (error) {
      const failure = error instanceof CentralError ? error : errorForNetwork(error);
      // A no from Central is not worth asking again. Unreachable or not deployed yet is.
      if (failure.kind === "rejected") {
        d.log.error(`[permissions] ${failure.message}. The list was not sent; deploy is blocked by CI for this.`);
        pending = false;
        return "refused";
      }
      if (attempt === attempts) {
        d.log.error(`[permissions] ${failure.message}. The list was not sent; trying again every minute.`);
        return "unreachable";
      }
      await d.sleep(2_000 * attempt);
    }
  }
  return "unreachable";
}

// One more try per minute, while the list is still waiting to be sent.
export async function retryPendingPermissions(deps: Partial<Deps> = {}) {
  if (!pending) return;
  await syncPermissionsOnBoot(PERMISSION_MANIFEST, deps, 1);
}
