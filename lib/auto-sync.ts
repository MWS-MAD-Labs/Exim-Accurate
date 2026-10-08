import { syncIfChanged } from "@/lib/central-user-sync";

// The sync of people from Central runs by itself, inside the server, so it does not depend on a
// scheduler outside the app (there is none in `npm run dev`). Each tick is one small question to
// Central; the whole list is read only when its key changed.
const MIN_SECONDS = 15;
const DEFAULT_SECONDS = 60;
const FIRST_RUN_MS = 5_000;

// 0 turns it off. Anything unusable falls back to the default, and nothing runs faster than 15 seconds.
export function autoSyncIntervalMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_SECONDS * 1000;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return DEFAULT_SECONDS * 1000;
  if (seconds === 0) return 0;
  return Math.max(seconds, MIN_SECONDS) * 1000;
}

type Timers = {
  setTimeout: typeof setTimeout;
  setInterval: typeof setInterval;
};

const globalState = globalThis as unknown as { __eximaAutoSync?: { stop: () => void } };

export function startAutoSync(
  run: () => Promise<{ status: string; message?: string }> = syncIfChanged,
  intervalMs = autoSyncIntervalMs(process.env.EXIMA_AUTO_SYNC_SECONDS),
  timers: Timers = { setTimeout, setInterval },
  firstRunMs = FIRST_RUN_MS,
) {
  // One timer per process, also after a hot reload.
  if (globalState.__eximaAutoSync) return globalState.__eximaAutoSync.stop;
  if (intervalMs <= 0) return () => undefined;

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await run();
      if (result.status === "synced") console.info("[sync] People changed in Central, Exima is up to date");
      else if (result.status === "error") console.error("[sync] Automatic sync failed:", result.message);
    } catch (error) {
      console.error("[sync] Automatic sync failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  const first = timers.setTimeout(tick, firstRunMs);
  const every = timers.setInterval(tick, intervalMs);
  // A timer must not keep the process alive on shutdown.
  (first as { unref?: () => void }).unref?.();
  (every as { unref?: () => void }).unref?.();
  const stop = () => {
    clearTimeout(first);
    clearInterval(every);
    delete globalState.__eximaAutoSync;
  };
  globalState.__eximaAutoSync = { stop };
  return stop;
}
