import { detectConversationLanguage, sanitizeConversationLanguage } from "./conversationLanguage";

const explicitLanguages = new Set<unknown>(["en", "he", "es", "ar"]);
const ambiguous = /^(?:ok(?:ay)?|yes|no|sure|hi|hey|hello|thanks|thank you|hola|sí|gracias|כן|לא|תודה|שלום|בסדר)$/iu;

/** The Inbox uses customer context. Account display preferences are outside this policy. */
export function resolveInboxReplyLanguage({
  explicit,
  conversationLanguage,
  history,
}: {
  explicit: unknown;
  conversationLanguage?: unknown;
  history: ReadonlyArray<{ role: string; content?: string | null }>;
}): string {
  if (typeof explicit === "string" && explicitLanguages.has(explicit)) return explicit;

  // Server-owned conversation language includes established Web Chat visitor language.
  const established = sanitizeConversationLanguage(conversationLanguage);
  if (established) return established;

  for (let index = history.length - 1; index >= 0; index--) {
    const turn = history[index];
    if (turn.role !== "user" || typeof turn.content !== "string") continue;
    // Split once, then inspect complete tokens. Searching for an embedded @ with
    // overlapping regex matches can rescan the same customer text quadratically.
    const text = turn.content.split(/\s+/u)
      .filter((token) => !token.includes("@") && !/^https?:\/\//i.test(token))
      .join(" ");
    const words = text.match(/\p{L}+/gu) || [];
    if (!words.length || ambiguous.test(words.join(" "))) continue;
    const detected = detectConversationLanguage(text);
    // The detector's English default is too weak for a single name or identifier.
    if (detected.confident && (detected.code !== "en" || words.length >= 3)) {
      return detected.code;
    }
  }

  // AI Settings has no structured reply-language default. Existing workspace prompt
  // instructions are still applied by the AI service.
  return "en";
}
