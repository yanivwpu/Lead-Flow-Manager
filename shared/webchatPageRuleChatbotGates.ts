/**
 * Page-rule inbound must not restart generic Ask Question or steal an existing thread.
 */

export function pageRuleChatbotTriggerGates(input: {
  isNewConversation: boolean;
  skipNewChatTrigger?: boolean;
  preferredFlowId?: string | null;
}): {
  preferredFlowId: string | undefined;
  allowNewChatTrigger: boolean;
} {
  const preferred =
    input.isNewConversation && input.preferredFlowId ? String(input.preferredFlowId) : undefined;
  return {
    preferredFlowId: preferred,
    allowNewChatTrigger: input.isNewConversation === true && input.skipNewChatTrigger !== true,
  };
}
