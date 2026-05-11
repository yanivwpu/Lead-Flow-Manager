/**
 * Meta / WhatsApp-style "outside 24-hour reply window" errors from API or stored `error_message`.
 * Shared by Unified Inbox UI and server persistence so failed bubbles stay consistent after refetch.
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
  if (m.includes("customer service window") || m.includes("service window")) return true;
  if (m.includes("whatsapp window expired")) return true;
  return false;
}

/** True for empty or vague client-only fallback copy — never replace a specific backend error with this. */
export function isGenericOutboundSendFallbackMessage(message: string): boolean {
  const t = (message || "").trim().toLowerCase();
  if (!t) return true;
  if (t.includes("check your connection") && t.includes("try again")) return true;
  if (t === "failed to send message" || t === "message delivery failed") return true;
  return false;
}
