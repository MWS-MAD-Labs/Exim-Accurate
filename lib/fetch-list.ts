// A list from an API route for a page to show. A reply that is not a list (a 401 or 403 body, an error) never
// reaches the page as one: it comes back empty, and a signed-out visitor is sent to the sign-in page.
export async function fetchList<T>(url: string, init?: RequestInit): Promise<T[]> {
  try {
    const response = await fetch(url, init);
    if (response.status === 401 && typeof window !== "undefined") {
      const here = window.location.pathname + window.location.search;
      // A whole page load on purpose, so nothing of the signed-out page stays.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/login?callbackUrl=${encodeURIComponent(here)}`;
      return [];
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(data)) {
      console.warn(`[fetchList] ${url} did not give a list (status ${response.status})`);
      return [];
    }
    return data as T[];
  } catch (error) {
    console.warn(`[fetchList] ${url} failed`, error);
    return [];
  }
}
