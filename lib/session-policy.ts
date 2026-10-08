// Signing people out is for taking access away. A new name, email, role or list of permissions does
// not end a session: permissions are read from the database on every request, so a change shows
// at once, and a person using Exima is not thrown out because something about them was updated.
export function endsSessions(before: readonly string[], after: readonly string[]) {
  return before.length > 0 && after.length === 0;
}
