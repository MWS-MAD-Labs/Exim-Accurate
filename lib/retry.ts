// Asks again while the failure is the kind that can pass (Central down for a deploy), and stops at
// once for an answer that would not change.
export async function withRetries<T>(
  run: () => Promise<T>,
  options: {
    retries: number;
    waitMs: number;
    shouldRetry: (error: unknown) => boolean;
    onRetry?: (error: unknown, attempt: number) => void;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= options.retries || !options.shouldRetry(error)) throw error;
      options.onRetry?.(error, attempt + 1);
      await sleep(options.waitMs);
    }
  }
}
