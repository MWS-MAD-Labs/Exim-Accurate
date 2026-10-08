import { PERMISSION_MANIFEST } from "@/lib/access-control";
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

export async function syncPermissionsOnBoot(
  manifest: PermissionManifestEntry[] = PERMISSION_MANIFEST,
  deps: Partial<Deps> = {},
  attempts = 3,
): Promise<PermissionSyncOutcome> {
  const d = { ...defaults, ...deps };
  if (!permissionSyncEnabled()) return "off";
  const application = APPLICATION_ID();

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const [registered, usage] = await Promise.all([d.list(application), d.usage(application)]);
      const check = comparePermissions(manifest, registered, usage);
      if (check.notRegistered.length === 0 && check.wouldDrop.length === 0 && check.requiresDiffer.length === 0) {
        return "in_sync";
      }
      // Never confirms removals: Central refuses a list that would drop permissions roles still carry.
      const result = await d.publish(application, manifest, false);
      d.log.info(`[permissions] Sent to Central: ${result.total} total, ${result.added} new`);
      if (result.affected_roles.length > 0) {
        d.log.warn(`[permissions] Roles still carry dropped permissions: ${result.affected_roles.map((role) => role.role).join(", ")}`);
      }
      return "published";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // An answer from Central that says no is not worth asking again.
      if (/drops|confirm|unknown permission|requires/i.test(message)) {
        d.log.warn(`[permissions] Central did not accept the list: ${message}`);
        return "refused";
      }
      if (attempt === attempts) {
        d.log.error(`[permissions] Central could not be reached, the list was not sent: ${message}`);
        return "unreachable";
      }
      await d.sleep(2_000 * attempt);
    }
  }
  return "unreachable";
}
