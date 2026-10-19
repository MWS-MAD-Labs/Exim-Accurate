// Where a signed-out visitor goes, with the page they were on so they come back to it.
export function signInUrl(here: string): string {
  return `/login?callbackUrl=${encodeURIComponent(here)}`;
}

// A whole page load on purpose, so nothing of the signed-out page stays.
export function sendToSignIn(): void {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  window.location.href = signInUrl(here);
}
