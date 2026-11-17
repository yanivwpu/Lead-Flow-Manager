/** Presentation state only. Never enables the engine or authorizes sending. */
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const pendingKey = (userId:string) => `whachat_commerce_welcome_pending_${userId}`;
const seenKey = (userId:string,shop:string) => `whachat_commerce_welcome_seen_${userId}_${shop}`;
const MAX_AGE = 24 * 60 * 60 * 1000;
export function rememberCommerceWelcome(userId:string, storage:Store, now=Date.now()) {
  try { if (!storage.getItem(pendingKey(userId))) storage.setItem(pendingKey(userId), String(now)); } catch { /* optional browser state */ }
}
export function hasPendingCommerceWelcome(userId:string, storage:Store, now=Date.now()) {
  try {
    const raw=storage.getItem(pendingKey(userId));
    const timestamp=Number(raw);
    return raw!==null && Number.isFinite(timestamp) && timestamp<=now && now-timestamp<MAX_AGE;
  } catch { return false; }
}
export function shouldShowCommerceWelcome({pending,connected,activated,seen}:{pending:boolean;connected:boolean;activated:boolean;seen:boolean}) {
  return pending && connected && !activated && !seen;
}
export function hasSeenCommerceWelcome(userId:string,shop:string,storage:Store) {
  try { return storage.getItem(seenKey(userId,shop)) === "1"; } catch { return false; }
}
export function finishCommerceWelcome(userId:string,shop:string,persistent:Store,session:Store) {
  try { persistent.setItem(seenKey(userId,shop),"1"); } catch { /* session dismissal still works */ }
  try { session.removeItem(pendingKey(userId)); } catch { /* optional */ }
}
