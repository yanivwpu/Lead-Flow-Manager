/** Only newly authored customer text can establish property intent or preferences. */
export function customerAuthoredText(raw: string | null | undefined): string {
  const lines = String(raw || "").split(/\r?\n/);
  const authored: string[] = [];
  for (const line of lines) {
    // Email replies/forwards contain someone else's words after these delimiters.
    if (/^\s*(?:-{2,}\s*(?:original|forwarded) message|begin forwarded message:|on .{1,200}wrote:)/i.test(line)) break;
    if (/^\s*(?:>|assistant\s*:|system\s*:)/i.test(line)) continue;
    authored.push(line);
  }
  return authored.join("\n").trim();
}

/**
 * Compact room counts need property/search context. A currency amount is not
 * sufficient: invoices and renewal dates otherwise become budgets and rooms.
 * Date labels apply locally so a buyer can also specify rooms in the same turn.
 */
export function matchPropertyBedBath(text: string): RegExpMatchArray | null {
  for (const match of text.matchAll(/(?<![\d/])(\d+)\s*\/\s*(\d+(?:\.\d+)?)(?![\d/])/g)) {
    const start = match.index!;
    const before = text.slice(Math.max(0, start - 60), start);
    const after = text.slice(start + match[0].length, start + match[0].length + 20);
    const explicitRoomsAfter = /^\s*(?:bed(?:room)?s?|baths?|br|condos?|houses?|homes?|apartments?|townhouses?)\b/i.test(after);
    if (/\b(?:renewal|renew|until|date|due|payment|paid|invoice|vence|fecha|hasta|renovaci[oó]n)\s*(?:\w{1,12}\s+){0,2}$/iu.test(before) ||
        (!explicitRoomsAfter && /\b(?:on|by|before|through)\s*$/iu.test(before)) ||
        /(?:חידוש|תאריך|בתאריך|עד|ב)\s*$/u.test(before) || /^\s*\/\s*\d/.test(after)) continue;
    const context = text.slice(Math.max(0, start - 100), start + match[0].length + 100);
    if (/\b(?:bed(?:room)?s?|baths?|br|house|home|condo|apartment|townhouse|property|sfh|pool|show\s+me|looking\s+for|(?:looking|want|ready)\s+to\s+(?:buy|rent|purchase)|(?:buy|rent)\s+(?:a|an)|instead|only|better|too\s+(?:big|many)|budget|under|up\s+to|in|near|around)\b|דירה|דירות|בית|חדרים/iu.test(context)) return match;
  }
  return null;
}

/** Shared by LLM input and deterministic fallback; never include assistant turns. */
export function buyerPreferenceEvidenceTranscript(conversation: Array<{role: string; content: string}>): string {
  return conversation.filter(m => m.role === "user")
    .map(m => customerAuthoredText(m.content)).filter(Boolean).slice(-14).join("\n");
}
