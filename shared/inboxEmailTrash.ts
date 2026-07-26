/**
 * Resolve the local message id used for Unified Inbox Gmail quick-trash.
 * Prefers rows with a non-empty externalMessageId (required by trash-email).
 */
export type LatestEmailMessageCandidate = {
  id: string;
  externalMessageId?: string | null;
};

export function resolveLastEmailMessageIdForInboxRow(
  candidates: readonly LatestEmailMessageCandidate[],
): string | null {
  if (!candidates.length) return null;
  const withProviderId = candidates.find((m) => String(m.externalMessageId || "").trim());
  return (withProviderId ?? candidates[0])?.id ?? null;
}
