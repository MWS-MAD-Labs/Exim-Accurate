// What /auth/sso does with a callback from Hub.
// "restart": Hub started the login (no state, no cookie), so Exima starts its own round.
// "reject": a state that does not match the cookie, or a callback without a code.
export function ssoCallbackAction(input: {
  code: string | null;
  state: string | null;
  nonce: string | null | undefined;
}): "continue" | "restart" | "reject" {
  const { code, state, nonce } = input;
  if (!code) return "reject";
  if (!state && !nonce) return "restart";
  if (!state || !nonce || state !== nonce) return "reject";
  return "continue";
}
