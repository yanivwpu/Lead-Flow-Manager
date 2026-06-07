/** User-facing copy for automation send guard blocks (templates, campaigns, workflows). */

export type AutomationSendGuardBlockReason =
  | "missing_idempotency_key"
  | "contact_missing"
  | "contact_wrong_user"
  | "do_not_contact"
  | "unsubscribed"
  | "channel_ineligible"
  | "conversation_inactive"
  | "duplicate";

/** Conversation statuses that re-engagement template sends may target (reopened after send). */
export const RE_ENGAGEMENT_REOPENABLE_CONVERSATION_STATUSES = [
  "closed",
  "resolved",
  "archived",
  "inactive",
] as const;

/** Always block automation sends regardless of re-engagement intent. */
export const HARD_BLOCKED_CONVERSATION_STATUSES = ["blocked", "deleted"] as const;

export function automationSendGuardBlockUserMessage(
  reason: AutomationSendGuardBlockReason | string,
  detail?: string | null
): string {
  const d = detail?.trim() || "";
  switch (reason) {
    case "duplicate":
      return "This template was already sent to this contact in the last minute. Wait a moment and try again.";
    case "do_not_contact":
      return "This contact is marked do-not-contact and cannot receive template messages.";
    case "unsubscribed":
      if (d === "marketing_opt_out") {
        return "This contact has opted out of marketing messages.";
      }
      return "This contact has opted out of messages.";
    case "conversation_inactive":
      if (d === "wrong_user") {
        return "You don't have access to this conversation.";
      }
      if (d === "blocked") {
        return "This WhatsApp conversation is blocked. Unblock it in Inbox before sending a template.";
      }
      if (d === "deleted") {
        return "This conversation no longer exists.";
      }
      if (d) {
        const label = d.charAt(0).toUpperCase() + d.slice(1);
        return `Conversation is ${label.toLowerCase()}. Reopen it in Inbox before sending a template.`;
      }
      return "This conversation is inactive. Reopen it in Inbox before sending a template.";
    case "channel_ineligible":
      return "This contact does not have a WhatsApp number on file.";
    case "contact_missing":
      return "Contact not found.";
    case "contact_wrong_user":
      return "You don't have access to this contact.";
    case "missing_idempotency_key":
      return "Could not send this template (missing send id). Please try again.";
    default:
      return "Template send blocked by automation safety checks.";
  }
}
