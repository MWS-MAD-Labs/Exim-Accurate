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

// A page for the tab that just signed out. A tab the Hub opened has the Hub tab as its opener: that tab is
// brought forward and this one closes. Any other tab (typed address, phone, Hub tab gone) goes to the Hub itself.
// The address goes in as JSON, so nothing in it can break out of the script.
export function closeOrRedirectHtml(url: string): string {
  const target = JSON.stringify(url).replace(/</g, "\\u003c");
  const attribute = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const script =
    `var hub=${target};` +
    `try{if(window.opener&&!window.opener.closed){window.opener.focus();window.close();}}catch(e){}` +
    `setTimeout(function(){location.replace(hub)},400);`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Keluar</title><meta http-equiv="refresh" content="2;url=${attribute}"></head><body><script>${script}</script></body></html>`;
}
