/**
 * After Gmail trash removes the last local message, the conversation is deleted.
 * The Inbox must leave that selection — otherwise URL/sticky can point at a
 * missing conversation and white-screen / update-loop the center pane.
 */

export type EmailTrashSelectionCleanupInput = {
  conversationDeleted: boolean;
  deletedConversationId: string | null | undefined;
  selectedConversationId: string | null | undefined;
  stickyConversationId?: string | null | undefined;
  selectedContactId?: string | null | undefined;
};

export type EmailTrashSelectionCleanupDecision = {
  /** Navigate to `/app/inbox` (clear contact + conversation URL). */
  shouldNavigateToInboxRoot: boolean;
  /** Clear sticky sibling-thread lock. */
  shouldClearSticky: boolean;
  reason:
    | "message_only"
    | "conversation_deleted_selected_match"
    | "conversation_deleted_selected_mismatch"
    | "conversation_deleted_selected_null"
    | "conversation_deleted_sticky_match";
};

export function decideEmailTrashSelectionCleanup(
  input: EmailTrashSelectionCleanupInput,
): EmailTrashSelectionCleanupDecision {
  if (!input.conversationDeleted) {
    return {
      shouldNavigateToInboxRoot: false,
      shouldClearSticky: false,
      reason: "message_only",
    };
  }

  const deleted = String(input.deletedConversationId || "").trim();
  const selected = String(input.selectedConversationId || "").trim();
  const sticky = String(input.stickyConversationId || "").trim();

  let reason: EmailTrashSelectionCleanupDecision["reason"] =
    "conversation_deleted_selected_null";
  if (selected && deleted && selected === deleted) {
    reason = "conversation_deleted_selected_match";
  } else if (selected && deleted && selected !== deleted) {
    reason = "conversation_deleted_selected_mismatch";
  } else if (!selected && sticky && deleted && sticky === deleted) {
    reason = "conversation_deleted_sticky_match";
  }

  // Always leave the deleted thread — match, mismatch, or null selection.
  return {
    shouldNavigateToInboxRoot: true,
    shouldClearSticky: true,
    reason,
  };
}
