// Runs once when the server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ startAutoSync }, { syncPermissionsOnBoot }] = await Promise.all([
    import("./lib/auto-sync"),
    import("./lib/permission-sync"),
  ]);
  startAutoSync();
  // Does not hold the server up and never stops it from starting.
  void syncPermissionsOnBoot().catch((error) => console.error("[permissions] Sync failed", error));
}
