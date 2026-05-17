import type { Channel, Contact, Conversation, Message } from "./schema";

export type InboundProcessingStateStatus = "processed" | "skipped" | "failed";

export interface InboundProcessingSubState {
  status: InboundProcessingStateStatus;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface InboundProcessingError {
  code: string;
  message: string;
  recoverable: boolean;
  stage?: string;
}

export interface InboundProcessingResult {
  success: boolean;
  contact: Contact | null;
  conversation: Conversation | null;
  message: Message | null;
  workflowState: InboundProcessingSubState;
  chatbotState: InboundProcessingSubState & { willFire: boolean };
  automationState: InboundProcessingSubState;
  created: {
    contact: boolean;
    conversation: boolean;
    message: boolean;
  };
  updated: {
    contact: boolean;
    conversation: boolean;
    message: boolean;
  };
  deduped: boolean;
  channel: Channel;
  sourceEventId: string | null;
  errors: InboundProcessingError[];

  /** Backward-compatible aliases for existing callers. */
  isNewConversation: boolean;
  chatbotWillFire: boolean;
}

export function inboundProcessingLog(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ tag: "[inbound-processing]", event, ...data }));
}
