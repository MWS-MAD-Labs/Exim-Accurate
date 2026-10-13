// A session another app's sign-out ended comes back from the session endpoint with an empty id.
// The sign-in pages are skipped: they run while that old cookie is still there and are making the new session.
export function sessionRevoked(status: string, userId: string | null | undefined, pathname: string | null): boolean {
  if (status !== "authenticated" || userId) return false;
  const path = pathname ?? "";
  return !(path === "/login" || path === "/auth" || path.startsWith("/auth/"));
}
