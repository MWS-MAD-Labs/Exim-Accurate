// One failed check is noise (a deploy, a blip); three in a row is worth telling people about.
export function createFailureTracker(threshold = 3) {
  let count = 0;
  return {
    // Returns the message to show once the failures have lasted, otherwise null.
    fail(message: string): string | null {
      count += 1;
      return count >= threshold ? message : null;
    },
    succeed() {
      count = 0;
    },
    get count() {
      return count;
    },
  };
}
