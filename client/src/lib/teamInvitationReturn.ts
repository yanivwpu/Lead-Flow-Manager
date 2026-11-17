// Kept in the original signup tab while the email-verification tab completes.
const KEY = "whachat_team_invitation_return";
export function invitationReturnPath(raw: string | null): string | null {
  return raw && /^\/team-invitation#[a-zA-Z0-9-]{1,128}\.[a-zA-Z0-9_-]{43}$/.test(raw) ? raw : null;
}
export function rememberInvitationReturn(raw: string | null) {
  try {
    const path = invitationReturnPath(raw);
    if (path) sessionStorage.setItem(KEY, path);
    else sessionStorage.removeItem(KEY);
  } catch { /* storage may be unavailable */ }
}
export function consumeInvitationReturn(): string | null {
  try {
    const path = invitationReturnPath(sessionStorage.getItem(KEY));
    sessionStorage.removeItem(KEY);
    return path;
  } catch { return null; }
}
