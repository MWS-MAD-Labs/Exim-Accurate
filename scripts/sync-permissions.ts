// Deploy step: tells Central which permissions Exima's code understands.
//   npm run permissions:sync [-- --confirm-removals]
//   npm run permissions:check [-- --allow-removals]   (changes nothing, exits 1 on a mismatch)
//   npm run permissions:check -- --before-deploy        (for CI: fails only if roles in Central use a
//                                                        permission this code no longer knows)
import { PERMISSION_MANIFEST } from "../lib/access-control";
import {
  comparePermissions,
  listRegisteredPermissions,
  permissionCheckFailed,
  permissionUsage,
  publishPermissions,
} from "../lib/central-permissions";

const APPLICATION_ID = "exima";
const [mode, ...flags] = process.argv.slice(2);

async function sync() {
  const result = await publishPermissions(APPLICATION_ID, PERMISSION_MANIFEST, flags.includes("--confirm-removals"));
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
