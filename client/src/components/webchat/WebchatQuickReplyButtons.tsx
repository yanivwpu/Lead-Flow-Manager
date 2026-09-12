import type { CSSProperties } from "react";
import {
  WEBCHAT_QUICK_REPLY_CLASS,
  WEBCHAT_QUICK_REPLY_CSS,
  webchatQuickReplyCssVars,
} from "@shared/webchatQuickReplyStyle";
import { messageTextDir } from "@shared/webchatWidgetLocale";

export type WebchatQuickReplyOption = {
  label: string;
  value: string;
};

export function WebchatQuickReplyButtons({
  buttons,
  accentColor,
  messageId,
  disabled = false,
  selectedValue,
  onSelect,
  testIdPrefix = "chat-btn",
}: {
  buttons: WebchatQuickReplyOption[];
  accentColor: string;
  messageId: string;
  disabled?: boolean;
  selectedValue?: string | null;
  onSelect?: (button: WebchatQuickReplyOption) => void;
  testIdPrefix?: string;
}) {
  const vars = webchatQuickReplyCssVars(accentColor);
  const groupDisabled = disabled || Boolean(selectedValue);

  return (
    <div className="mt-1.5 flex w-full min-w-0 flex-col gap-1.5" data-testid={`${testIdPrefix}-group-${messageId}`}>
      <style>{WEBCHAT_QUICK_REPLY_CSS}</style>
      {buttons.map((btn, i) => {
        const isSelected = selectedValue === btn.value;
        const isOff = groupDisabled;
        return (
          <button
            key={`${btn.value}-${i}`}
            type="button"
            disabled={isOff}
            data-selected={isSelected ? "true" : "false"}
            data-testid={`${testIdPrefix}-${messageId}-${i}`}
            dir={messageTextDir(btn.label)}
            onClick={() => {
              if (isOff) return;
              onSelect?.(btn);
            }}
            className={`${WEBCHAT_QUICK_REPLY_CLASS} w-full min-h-[44px] text-sm font-medium py-2 px-4 rounded-xl touch-manipulation break-words [overflow-wrap:anywhere] whitespace-normal`}
            style={vars as CSSProperties}
          >
            {btn.label}
          </button>
        );
      })}
    </div>
  );
}
