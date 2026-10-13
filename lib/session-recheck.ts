// A session another app's sign-out ended comes back from the session endpoint with a user that has no id.
export function sessionRevoked(session: { user?: { id?: string | null } | null } | null | undefined): boolean {
  return Boolean(session?.user && !session.user.id);
}

// The sign-in pages run while the old cookie is still there and are making the new session, so they are skipped.
export function isSignInPath(pathname: string | null): boolean {
  const path = pathname ?? "";
  return path === "/login" || path === "/auth" || path.startsWith("/auth/");
}
