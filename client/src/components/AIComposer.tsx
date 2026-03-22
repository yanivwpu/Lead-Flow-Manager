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
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const prevIdRef = useRef<string | null>(null);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    if (setTyping) {
      setTyping(true);
      if (typingTimeoutRef?.current) clearTimeout(typingTimeoutRef.current);
      if (typingTimeoutRef) typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (setTyping) setTyping(false);
      onSend();
    }
  };

  const handleAutoOverride = () => {
    setAutoOverride(true);
    setAiMode("manual");
    setTimeout(() => inputRef.current?.focus(), 0);
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

      {/* AI status line — subtle, above the input */}
      {aiEnabled && statusLineText && (
        <div className="px-4 py-1 flex items-center gap-1.5 bg-gray-50/80 border-b border-gray-100">
          <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
          <span className="text-[11px] text-gray-400 italic">{statusLineText}</span>
          {isDrafting && <Loader2 className="w-3 h-3 text-purple-400 animate-spin ml-0.5 shrink-0" />}
        </div>
      )}

      {/* Single composer row: [Mode] [Emoji] [Attach] [Input ............] [Regenerate] [Send] */}
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2">

        {/* AI mode selector */}
        {aiEnabled && (
          <div
            className="hidden sm:flex items-center rounded-md border border-gray-200 bg-gray-50 overflow-hidden shrink-0"
            data-testid="ai-mode-selector"
          >
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
                    "flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-colors",
                    active ? "bg-purple-600 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <Icon className="w-3 h-3 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Emoji + file attachment */}
        <div className="hidden sm:flex items-center gap-2 text-gray-400 shrink-0">
          <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
            <PopoverTrigger asChild>
              <button className="hover:text-gray-600 transition-colors" data-testid="button-emoji">
                <Smile className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 border-0" align="start" side="top">
              <EmojiPicker onEmojiClick={(d) => { onChange(value + d.emoji); setEmojiPickerOpen(false); }} />
            </PopoverContent>
          </Popover>

          {fileInputRef && handleFileSelect && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="hover:text-gray-600 transition-colors"
                data-testid="button-attach-file"
              >
                <Paperclip className="h-5 w-5" />
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

        {/* Input field or Auto-passive placeholder */}
        <div className="flex-1 min-w-0">
          {isAutoPassive ? (
            <div
              onClick={handleAutoOverride}
              data-testid="auto-mode-passive-input"
              className="flex items-center gap-2 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-400 cursor-pointer select-none"
            >
              <Zap className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              <span className="italic flex-1">AI is handling this conversation…</span>
              <span className="text-[11px] text-purple-500 not-italic font-medium whitespace-nowrap">Click to take over</span>
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              placeholder={isSuggestMode && isDrafting ? "AI is drafting…" : "Type a message"}
              className={cn(
                "w-full border rounded-lg px-3 sm:px-4 py-2 text-sm focus:outline-none transition-colors",
                isSuggestMode && (isDrafting || aiDraft)
                  ? "bg-purple-50/40 border-purple-200 focus:border-purple-400"
                  : "bg-white border-gray-200 focus:border-brand-green"
              )}
              value={value}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onBlur={() => setTyping && setTyping(false)}
              readOnly={isSuggestMode && isDrafting}
              data-testid="input-message"
            />
          )}
        </div>

        {/* Regenerate — minimal, only when draft is ready in Suggest mode */}
        {isSuggestMode && !isDrafting && aiDraft && (
          <button
            onClick={fetchSuggestion}
            disabled={aiCooldown}
            className="hidden sm:flex items-center gap-1 text-xs px-2 py-1.5 rounded-md text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors disabled:opacity-40 shrink-0"
            data-testid="button-regenerate-ai"
          >
            <RefreshCw className={cn("w-3 h-3", aiCooldown && "animate-spin")} />
            <span>Regenerate</span>
          </button>
        )}

        {/* Send */}
        {!isAutoPassive && (
          <button
            onClick={onSend}
            className="h-9 w-9 bg-brand-green hover:bg-emerald-700 rounded-full flex items-center justify-center text-white transition-colors shadow-sm shrink-0"
            data-testid="button-send-message"
          >
            <Send className="h-4 w-4 ml-0.5" />
          </button>
        )}
      </div>
    </div>
  );
}
