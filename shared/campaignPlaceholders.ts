/**
 * Collect `{{placeholder}}` keys from preset campaign message bodies (order not preserved across steps).
 */
export function extractPlaceholderKeysFromCampaignMessages(messages: unknown[]): string[] {
  const keys = new Set<string>();
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  for (const raw of messages) {
    const content =
      raw &&
      typeof raw === "object" &&
      typeof (raw as { content?: unknown }).content === "string"
        ? (raw as { content: string }).content
        : "";
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      keys.add(m[1].trim());
    }
  }
  return Array.from(keys).sort();
}
