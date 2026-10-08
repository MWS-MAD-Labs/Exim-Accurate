// "now", "5m ago", "2h ago", "3d ago". The long form is for tooltips.
export function shortAgo(value: string | Date | null, now = Date.now()) {
  if (!value) return "never";
  const seconds = Math.max(Math.round((now - new Date(value).getTime()) / 1000), 0);
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function longAgo(value: string | Date | null, now = Date.now()) {
  if (!value) return "never";
  const seconds = Math.max(Math.round((now - new Date(value).getTime()) / 1000), 0);
  if (seconds < 60) return "just now";
  const units: [number, string][] = [[86400, "day"], [3600, "hour"], [60, "minute"]];
  for (const [size, name] of units) {
    if (seconds >= size) {
      const count = Math.floor(seconds / size);
      return `${count} ${name}${count === 1 ? "" : "s"} ago`;
    }
  }
  return "just now";
}
