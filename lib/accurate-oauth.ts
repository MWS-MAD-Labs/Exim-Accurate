// The address Accurate sends a person back to after they allow access. It has to be written as an address, point at
// the callback of this application, and be the same as the one registered in the Accurate developer application.
export const CALLBACK_PATH = "/accurate/callback";

export type RedirectCheck = { error: string | null; warning: string | null };

export function checkRedirectUri(redirectUri: string, requestOrigin: string): RedirectCheck {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return { error: `ACCURATE_REDIRECT_URI is not an address: "${redirectUri}". Write it like http://localhost:3001${CALLBACK_PATH}`, warning: null };
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || !redirectUri.includes(`${url.protocol}//`) || !url.hostname) {
    return { error: `ACCURATE_REDIRECT_URI must start with http:// or https:// and name a host, it is "${redirectUri}". Write it like http://localhost:3001${CALLBACK_PATH}`, warning: null };
  }
  if (url.pathname.replace(/\/+$/, "") !== CALLBACK_PATH) {
    return { error: `ACCURATE_REDIRECT_URI has to end in ${CALLBACK_PATH}, it is "${redirectUri}"`, warning: null };
  }
  let origin: URL | null = null;
  try {
    origin = new URL(requestOrigin);
  } catch {
    origin = null;
  }
  if (origin && origin.host !== url.host) {
    return {
      error: null,
      warning: `ACCURATE_REDIRECT_URI points at ${url.host} but this application is opened at ${origin.host}. After the person allows access Accurate sends them to ${url.host}.`,
    };
  }
  return { error: null, warning: null };
}
