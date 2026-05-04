/**
 * Detects Meta / WhatsApp-style "outside 24-hour reply window" errors from API messages.
 * Used to avoid alarming toasts and show calmer inline copy in the chat thread.
 */
export function isMetaReplyWindowExpiredError(message: string): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  if (m.includes("24-hour") || m.includes("24 hour")) return true;
  if (m.includes("window expired")) return true;
  if (m.includes("messaging window has expired")) return true;
  if (m.includes("outside") && m.includes("24") && m.includes("hour")) return true;
  if (m.includes("messenger policy")) return true;
  if (m.includes("policy") && m.includes("message") && (m.includes("window") || m.includes("24"))) return true;
  return false;
}
