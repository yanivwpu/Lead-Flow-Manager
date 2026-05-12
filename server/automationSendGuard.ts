import { storage } from "./storage";

export type AutomationSendDedupResult<T> =
  | { ok: true; result: T }
  | { ok: false; skipped: true };

/**
 * Runs `fn` only if dedup key can be acquired. Always completes dedup row to terminal status.
 */
export async function withAutomationSendDedup<T>(
  dedupKey: string,
  userId: string,
  contactId: string | null | undefined,
  fn: () => Promise<T>
): Promise<AutomationSendDedupResult<T>> {
  const acquired = await storage.tryAcquireAutomationSendDedup(dedupKey, userId, contactId ?? null);
  if (!acquired) {
    return { ok: false, skipped: true };
  }
  try {
    const result = await fn();
    await storage.completeAutomationSendDedup(dedupKey, "completed");
    return { ok: true, result };
  } catch (e) {
    await storage.completeAutomationSendDedup(dedupKey, "skipped");
    throw e;
  }
}
