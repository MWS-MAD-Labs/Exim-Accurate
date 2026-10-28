// Deploy step: tells Central which permissions Exima's code understands. The command is the shared one from
// mws-central-auth.
//   npm run permissions:sync [-- --confirm-removals] [--retries 5 --wait 20]
//     --retries/--wait: asks again when Central cannot be reached (it may be deploying). A no from
//     Central, or an endpoint it does not have yet, fails at once.
//   npm run permissions:check [-- --allow-removals]   (changes nothing, exits 1 on a mismatch)
//   npm run permissions:check -- --before-deploy        (for CI: fails only if roles in Central use a
//                                                        permission this code no longer knows)
import { runPermissionsCli } from "mws-central-auth/access/cli";
import { PERMISSION_MANIFEST } from "../lib/access-control";

const [mode, ...flags] = process.argv.slice(2);
if (mode !== "sync" && mode !== "check") {
  console.error("Use `sync` or `check`");
  process.exit(1);
}

void runPermissionsCli({ application: "exima", manifest: PERMISSION_MANIFEST, command: mode, argv: flags }).then((code) => process.exit(code));
