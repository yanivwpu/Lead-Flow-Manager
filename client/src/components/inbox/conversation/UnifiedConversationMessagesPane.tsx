/**
 * Center conversation presentation shell — layout mode by channel.
 * Business state remains in UnifiedInbox; this only wraps chrome.
 */
import type { CSSProperties, ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  getConversationThreadChrome,
  type ConversationLayoutMode,
} from "@/lib/inboxConversationPresentation";

export function UnifiedConversationMessagesPane({
  channel,
  containerRef,
  innerRef,
  children,
  className,
  endSlot,
  banner,
}: {
  channel: string | null | undefined;
  containerRef?: RefObject<HTMLDivElement | null>;
  innerRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  className?: string;
  /** Sticky bottom slot inside the scroller (e.g. messagesEndRef sentinel) — pass inside children instead if preferred */
  endSlot?: ReactNode;
  banner?: ReactNode;
}) {
  const chrome = getConversationThreadChrome(channel);
  return (
    <div
      ref={containerRef}
      className={cn(chrome.scrollerClassName, className)}
      style={chrome.scrollerStyle as CSSProperties | undefined}
      data-testid="inbox-conversation-messages"
      data-conversation-layout={chrome.layout as ConversationLayoutMode}
      data-active-channel={String(channel || "")}
    >
      {chrome.overlayClassName ? <div className={chrome.overlayClassName} /> : null}
      <div ref={innerRef} className={chrome.innerClassName}>
        {children}
        {endSlot}
      </div>
      {banner}
    </div>
  );
}
