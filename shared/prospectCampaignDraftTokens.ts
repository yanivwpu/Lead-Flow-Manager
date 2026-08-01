/**
 * Detect unresolved personalization tokens in campaign draft snapshots.
 * Supports {{token}} and {token} forms commonly used in templates.
 */
const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}|\{([a-zA-Z][a-zA-Z0-9_.-]*)\}/g;

export function extractCampaignDraftTokens(
  subject?: string | null,
  message?: string | null,
): string[] {
  const blob = `${subject || ""}\n${message || ""}`;
  const found = new Set<string>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(blob)) !== null) {
    const name = (m[1] || m[2] || "").trim();
    if (name) found.add(name);
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

/** Whether a queue row draft can still be edited / regenerated / deleted. */
export function isCampaignDraftEditable(queueStatus: string | null | undefined): boolean {
  const s = String(queueStatus || "").toLowerCase();
  return s === "queued" || s === "paused" || s === "failed";
}

/** Ready (queued) drafts that still contain unresolved {{tokens}} — warn before Start Sending. */
export function countQueuedDraftsWithUnresolvedTokens(
  items: Array<{
    queueStatus?: string | null;
    unresolvedTokenCount?: number | null;
  }>,
): number {
  return items.filter(
    (item) =>
      String(item.queueStatus || "").toLowerCase() === "queued" &&
      (item.unresolvedTokenCount ?? 0) > 0,
  ).length;
}
