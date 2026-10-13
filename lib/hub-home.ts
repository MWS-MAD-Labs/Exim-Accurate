// The Hub front page, where people pick an app. Null when the Hub address is not set.
export function hubHomeUrl(): string | null {
  const base = process.env.HUB_BASE_URL?.trim();
  if (!base) return null;
  try {
    return new URL("/", base).toString();
  } catch {
    return null;
  }
}
