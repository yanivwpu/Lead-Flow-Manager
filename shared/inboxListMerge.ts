/**
 * Shared Inbox list merge: session pins + recent server rows.
 * Canonical row identity is `inboxRowKey` (conversation.id || contact.id).
 */

import { inboxRowKey } from "./inboxRowModel";

export type InboxListItemLike = {
  contact: { id: string };
  conversation?: { id?: string | null } | null;
  lastMessageAt?: Date | string | null;
};

function lastMessageAtMs(item: InboxListItemLike): number {
  const v = item.lastMessageAt;
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function sortInboxByLastMessageAtDesc<T extends InboxListItemLike>(items: T[]): T[] {
  return [...items].sort((a, b) => lastMessageAtMs(b) - lastMessageAtMs(a));
}

/**
 * Merge recent server rows with session pins.
 * Matching `inboxRowKey`: recent/server wins (fresher preview/unread/assignment).
 * Leftover pins keep natural lastMessageAt order — not forced to the top.
 */
export function mergeInboxWithSessionPins<T extends InboxListItemLike>(
  recent: readonly T[],
  pins: readonly T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const pin of pins) {
    byKey.set(inboxRowKey(pin), pin);
  }
  for (const row of recent) {
    byKey.set(inboxRowKey(row), row);
  }
  return sortInboxByLastMessageAtDesc([...byKey.values()]);
}

/**
 * Upsert candidate pins for deep-linked / selected contacts.
 * Drops any candidate (or prior pin) whose key already exists in `recent`.
 * Returns `prevPins` (same reference) when the pin set/order is unchanged —
 * required to avoid React #185 when callers pass a fresh `[]` candidates array
 * every render (e.g. empty Inbox selection).
 */
export function upsertSessionPins<T extends InboxListItemLike>(
  prevPins: readonly T[],
  candidates: readonly T[],
  recent: readonly T[],
): T[] {
  const recentKeys = new Set(recent.map((r) => inboxRowKey(r)));
  const next = new Map<string, T>();
  for (const pin of prevPins) {
    const key = inboxRowKey(pin);
    if (!recentKeys.has(key)) next.set(key, pin);
  }
  for (const candidate of candidates) {
    const key = inboxRowKey(candidate);
    if (recentKeys.has(key)) {
      next.delete(key);
      continue;
    }
    next.set(key, candidate);
  }
  if (sessionPinsUnchanged(prevPins, next)) {
    return prevPins as T[];
  }
  return [...next.values()];
}

/** True when `next` has the same keys/order and the same row object refs as `prevPins`. */
function sessionPinsUnchanged<T extends InboxListItemLike>(
  prevPins: readonly T[],
  next: Map<string, T>,
): boolean {
  if (prevPins.length !== next.size) return false;
  let i = 0;
  for (const [key, item] of next) {
    const prev = prevPins[i];
    if (!prev || inboxRowKey(prev) !== key || prev !== item) return false;
    i += 1;
  }
  return true;
}

/** Sanitize Inbox search query: trim, min 2, max length. */
export const INBOX_SEARCH_MIN_CHARS = 2;
export const INBOX_SEARCH_MAX_CHARS = 64;
export const INBOX_SEARCH_RESULT_LIMIT = 50;

export function sanitizeInboxSearchQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length < INBOX_SEARCH_MIN_CHARS) return null;
  return trimmed.slice(0, INBOX_SEARCH_MAX_CHARS);
}

/** Digits-only phone fragment for normalized phone match (min 7 digits). */
export function inboxSearchPhoneDigits(query: string): string | null {
  const digits = query.replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

/** Dev/test timing helper — no PII; silent in production. */
export function recordInboxTiming(
  label: string,
  ms: number,
  meta?: Record<string, number | boolean | string | undefined>,
): void {
  const nodeEnv =
    typeof process !== "undefined" ? process.env?.NODE_ENV : undefined;
  if (nodeEnv === "production") return;
  // eslint-disable-next-line no-console
  console.debug(`[InboxTiming] ${label}`, { ms: Math.round(ms), ...meta });
}
