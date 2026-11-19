export const BUSY = Symbol("busy");

// Lets one run of a task go at a time in this process. A call made while a run is going does not start another: it gets BUSY
// back at once. A run that never ends stops blocking after `staleAfterMs`, so one stuck run cannot block the task for good.
export function singleFlight<T>(task: () => Promise<T>, staleAfterMs: number, now: () => number = Date.now) {
  let startedAt: number | null = null;
  return async (): Promise<T | typeof BUSY> => {
    if (startedAt !== null && now() - startedAt < staleAfterMs) return BUSY;
    const mine = now();
    startedAt = mine;
    try {
      return await task();
    } finally {
      if (startedAt === mine) startedAt = null;
    }
  };
}
