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

// A page that closes the tab (it was opened from the Hub, so the browser allows it) and falls back to going
// to `url` when it cannot be closed. The address goes in as JSON, so nothing in it can break out of the script.
export function closeOrRedirectHtml(url: string): string {
  const target = JSON.stringify(url).replace(/</g, "\\u003c");
  const attribute = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Keluar</title><meta http-equiv="refresh" content="2;url=${attribute}"></head><body><script>window.close();setTimeout(function(){location.replace(${target})},300);</script></body></html>`;
}
