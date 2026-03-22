import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Send,
  Smile,
  Paperclip,
  RefreshCw,
  Loader2,
  Sparkles,
  Zap,
  User,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "emoji-picker-react";
import { cn } from "@/lib/utils";

type AIMode = "manual" | "suggest" | "auto";

export interface AIComposerMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  aiEnabled: boolean;
  hasFullAIBrain?: boolean;
  conversationId: string | null;
  messages: AIComposerMessage[];
  demoMode?: boolean;
  setTyping?: (typing: boolean) => void;
  typingTimeoutRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  handleFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const AUTO_STATUS_MESSAGES = [
  "AI is qualifying this lead…",
  "Preparing follow-up…",
  "AI is analyzing the conversation…",
  "Waiting for response…",
  "AI sent a message just now",
];

const MIN_TEXTAREA_HEIGHT = 64;
const MAX_TEXTAREA_HEIGHT = 180;

export function AIComposer({
  value,
  onChange,
  onSend,
  aiEnabled,
  hasFullAIBrain = false,
  conversationId,
  messages,
  demoMode = false,
  setTyping,
  typingTimeoutRef,
  fileInputRef,
  handleFileSelect,
  className,
}: AIComposerProps) {
  const [aiMode, setAiMode] = useState<AIMode>("manual");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiCooldown, setAiCooldown] = useState(false);
  const [autoStatusIndex, setAutoStatusIndex] = useState(0);
  const [autoOverride, setAutoOverride] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef<string | null>(null);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
  }, [value]);

  // Reset when conversation changes
  useEffect(() => {
    if (conversationId !== prevIdRef.current) {
      prevIdRef.current = conversationId;
      setAiDraft(null);
      setIsDrafting(false);
      setAutoOverride(false);
    }
  }, [conversationId]);

  // Rotate auto status text
  useEffect(() => {
    if (aiMode === "auto" && !autoOverride) {
      const interval = setInterval(() => {
        setAutoStatusIndex((i) => (i + 1) % AUTO_STATUS_MESSAGES.length);
      }, 4000);
      return () => clearInterval(interval);
    }
  }, [aiMode, autoOverride]);

  const fetchSuggestion = useCallback(async () => {
    if (!conversationId || !aiEnabled || demoMode || aiCooldown) return;
    setIsDrafting(true);
    setAiDraft(null);
    onChange("");
    setAiCooldown(true);
    setTimeout(() => setAiCooldown(false), 3000);

    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatId: conversationId,
          conversationHistory: messages.slice(-10),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const suggestion = data.suggestion || null;
        setAiDraft(suggestion);
        if (suggestion) onChange(suggestion);
      } else {
        setAiDraft(null);
      }
    } catch {
      setAiDraft(null);
    } finally {
      setIsDrafting(false);
    }
  }, [conversationId, aiEnabled, demoMode, aiCooldown, messages, onChange]);

  const handleModeChange = (mode: AIMode) => {
    setAiMode(mode);
    setAiDraft(null);
    setIsDrafting(false);
    setAutoOverride(false);
    onChange("");
    if (mode === "suggest" && aiEnabled) fetchSuggestion();
    if (mode === "auto") setAutoStatusIndex(0);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    if (setTyping) {
      setTyping(true);
      if (typingTimeoutRef?.current) clearTimeout(typingTimeoutRef.current);
      if (typingTimeoutRef) typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (setTyping) setTyping(false);
      onSend();
    }
  };

  const handleAutoOverride = () => {
    setAutoOverride(true);
    setAiMode("manual");
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const isAutoPassive = aiMode === "auto" && !autoOverride;
  const isSuggestMode = aiMode === "suggest" && aiEnabled;

  const statusLineText = (() => {
    if (isSuggestMode) {
      if (isDrafting) return "AI is drafting a reply…";
      if (aiDraft) return "AI reply ready — edit or send";
      return "Switching to AI Suggest…";
    }
    if (isAutoPassive) return AUTO_STATUS_MESSAGES[autoStatusIndex];
    return null;
  })();

  return (
    <div className={cn("border-t border-gray-200 bg-white shrink-0", className)}>

      {/* AI status line */}
      {aiEnabled && statusLineText && (
        <div className="px-4 py-1.5 flex items-center gap-1.5 bg-gray-50/80 border-b border-gray-100">
          <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
          <span className="text-[11px] text-gray-400 italic">{statusLineText}</span>
          {isDrafting && <Loader2 className="w-3 h-3 text-purple-400 animate-spin ml-0.5 shrink-0" />}
        </div>
      )}

      <div className="px-3 pt-2 pb-2 flex flex-col gap-2">

        {/* Row 1: AI mode selector */}
        {aiEnabled && (
          <div className="flex items-center gap-1" data-testid="ai-mode-selector">
            {(["manual", "suggest", "auto"] as AIMode[]).map((mode) => {
              const label = mode === "manual" ? "Manual" : mode === "suggest" ? "Suggest" : "Auto";
              const Icon = mode === "manual" ? User : mode === "suggest" ? Sparkles : Zap;
              const active = aiMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  data-testid={`composer-ai-mode-${mode}`}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all",
                    active
                      ? "bg-purple-600 text-white shadow-sm"
                      : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200"
                  )}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* Row 2: Textarea or Auto-passive */}
        {isAutoPassive ? (
          <div
            onClick={handleAutoOverride}
            data-testid="auto-mode-passive-input"
            className="flex items-center gap-2 w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-sm text-gray-400 cursor-pointer select-none min-h-[64px]"
          >
            <Zap className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="italic flex-1 leading-relaxed">AI is handling this conversation…</span>
            <span className="text-[11px] text-purple-500 not-italic font-medium whitespace-nowrap">Click to take over</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            placeholder={isSuggestMode && isDrafting ? "AI is drafting…" : "Type a message… (Enter to send, Shift+Enter for new line)"}
            className={cn(
              "w-full border rounded-xl px-4 py-3 text-sm leading-relaxed focus:outline-none transition-colors resize-none overflow-y-auto",
              isSuggestMode && (isDrafting || aiDraft)
                ? "bg-purple-50/50 border-purple-200 focus:border-purple-400 text-gray-800"
                : "bg-white border-gray-200 focus:border-brand-green text-gray-800"
            )}
            style={{ minHeight: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT }}
            value={value}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            onBlur={() => setTyping && setTyping(false)}
            readOnly={isSuggestMode && isDrafting}
            data-testid="input-message"
          />
        )}

        {/* Row 3: Actions */}
        <div className="flex items-center justify-between">
          {/* Left: emoji + attach */}
          <div className="flex items-center gap-2 text-gray-400">
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="p-1.5 rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  data-testid="button-emoji"
                >
                  <Smile className="h-4.5 w-4.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
                <EmojiPicker
                  onEmojiClick={(d) => {
                    onChange(value + d.emoji);
                    setEmojiPickerOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>

            {fileInputRef && handleFileSelect && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 rounded-lg hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  data-testid="button-attach-file"
                >
                  <Paperclip className="h-4.5 w-4.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileSelect}
                />
              </>
            )}
          </div>

          {/* Right: regenerate + send */}
          {!isAutoPassive && (
            <div className="flex items-center gap-2">
              {isSuggestMode && !isDrafting && aiDraft && (
                <button
                  onClick={fetchSuggestion}
                  disabled={aiCooldown}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 border border-gray-200 hover:border-purple-200 transition-colors disabled:opacity-40"
                  data-testid="button-regenerate-ai"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", aiCooldown && "animate-spin")} />
                  Regenerate
                </button>
              )}
              <button
                onClick={onSend}
                className="h-9 px-4 bg-brand-green hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 text-white text-sm font-medium transition-colors shadow-sm"
                data-testid="button-send-message"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
