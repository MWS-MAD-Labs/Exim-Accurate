// Deploy step: tells Central which permissions Exima's code understands.
//   npm run permissions:sync [-- --confirm-removals] [--retries 5 --wait 20]
//     --retries/--wait: asks again when Central cannot be reached (it may be deploying). A no from
//     Central, or an endpoint it does not have yet, fails at once.
//   npm run permissions:check [-- --allow-removals]   (changes nothing, exits 1 on a mismatch)
//   npm run permissions:check -- --before-deploy        (for CI: fails only if roles in Central use a
//                                                        permission this code no longer knows)
import { PERMISSION_MANIFEST } from "../lib/access-control";
import { CentralError, errorForNetwork } from "../lib/central-errors";
import { withRetries } from "../lib/retry";
import {
  comparePermissions,
  listRegisteredPermissions,
  permissionCheckFailed,
  permissionUsage,
  publishPermissions,
} from "../lib/central-permissions";

const APPLICATION_ID = "exima";
const [mode, ...flags] = process.argv.slice(2);

function flagNumber(name: string, fallback: number) {
  const index = flags.indexOf(name);
  const value = index >= 0 ? Number(flags[index + 1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

async function sync() {
  const result = await withRetries(
    () => publishPermissions(APPLICATION_ID, PERMISSION_MANIFEST, flags.includes("--confirm-removals")),
    {
      retries: flagNumber("--retries", 0),
      waitMs: flagNumber("--wait", 20) * 1000,
      shouldRetry: (error) => (error instanceof CentralError ? error : errorForNetwork(error)).kind === "unreachable",
      onRetry: (error, attempt) => console.warn(`attempt ${attempt} failed (${error instanceof Error ? error.message : error}), asking again`),
    },
  );
  console.log(`exima permissions published: ${result.total} total, ${result.added} new`);
  if (result.deprecated.length > 0) console.warn(`dropped from the list: ${result.deprecated.join(", ")}`);
  if (result.affected_roles.length > 0) {
    console.warn("these active roles still carry a dropped permission, move them to a current one:");
    for (const role of result.affected_roles) console.warn(`  ${role.role}: ${role.permissions.join(", ")}`);
  }
}

async function check() {
  const [registered, usage] = await Promise.all([listRegisteredPermissions(APPLICATION_ID), permissionUsage(APPLICATION_ID)]);
  const result = comparePermissions(PERMISSION_MANIFEST, registered, usage);
  const lines: [string, string[]][] = [
    ["not registered in Central yet (a deploy adds them)", result.notRegistered],
    ["registered but gone from the code (a deploy drops them)", result.wouldDrop],
    ["carried by roles but unknown to the code", result.unknownToCode],
    ["registered with different needs than the code", result.requiresDiffer],
  ];
  for (const [label, keys] of lines) if (keys.length > 0) console.warn(`${label}: ${keys.join(", ")}`);
  const failed = flags.includes("--before-deploy")
    ? result.unknownToCode.length > 0
    : permissionCheckFailed(result, flags.includes("--allow-removals"));
  if (failed) {
    console.error("exima permissions do not match Central");
    process.exit(1);
  }
  console.log("exima permissions match Central");
}

async function main() {
  if (mode === "sync") await sync();
  else if (mode === "check") await check();
  else throw new Error("Use `sync` or `check`");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
