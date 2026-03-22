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
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "emoji-picker-react";
import { cn } from "@/lib/utils";
import { AICreditBadge, AIUpgradePrompt } from "./AIUpgradePrompt";
import type { AICapabilities } from "@/lib/useAICapabilities";

type AIMode = "manual" | "suggest" | "auto";
type AutoPhase = "idle" | "typing" | "replied" | "waiting";

export interface AIComposerMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ContactContext {
  name?: string;
  tag?: string;
  pipelineStage?: string;
  notes?: string;
  budget?: string;
  timeline?: string;
  financing?: string;
  intent?: string;
  leadScore?: string;
}

export interface AIComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  /** Direct send callback for Auto mode — bypasses controlled state */
  onAutoSend?: (message: string) => void;
  aiEnabled: boolean;
  hasFullAIBrain?: boolean;
  /** Full capability object from useAICapabilities — drives gating & credit display */
  capabilities?: AICapabilities;
  /** CRM context injected into AI prompt to improve reply quality */
  contactContext?: ContactContext;
  conversationId: string | null;
  messages: AIComposerMessage[];
  demoMode?: boolean;
  setTyping?: (typing: boolean) => void;
  typingTimeoutRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  handleFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
}

const MIN_TEXTAREA_HEIGHT = 58;
const MAX_TEXTAREA_HEIGHT = 160;

// Canned demo replies for when demoMode=true (no real API call)
const DEMO_SUGGESTIONS = [
  "Got it — I'll pull up the best matches for your criteria. Are you flexible on location or is it a hard requirement?",
  "That sounds like a great fit. Would a weekday or weekend viewing work better for you?",
  "Understood. Based on that budget, I have a few strong options ready. Want me to send over the details?",
  "Perfect — that timeline works well. Are you pre-approved, or would you like me to recommend a lender?",
  "Great choice. Shall I book a quick call with our specialist to walk you through the options?",
];
let _demoCycleIdx = 0;

export function AIComposer({
  value,
  onChange,
  onSend,
  onAutoSend,
  aiEnabled,
  hasFullAIBrain = false,
  capabilities,
  contactContext,
  conversationId,
  messages,
  demoMode = false,
  setTyping,
  typingTimeoutRef,
  fileInputRef,
  handleFileSelect,
  className,
}: AIComposerProps) {
  // Resolve effective access from capabilities (falls back to legacy aiEnabled prop)
  const effectiveCanSuggest = capabilities ? capabilities.canUseSuggest : aiEnabled;
  const effectiveCanAuto    = capabilities ? capabilities.canUseAuto    : (aiEnabled && hasFullAIBrain);
  const showAIModes         = aiEnabled || (capabilities && capabilities.plan !== 'free');
  const [aiMode, setAiMode] = useState<AIMode>("manual");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiCooldown, setAiCooldown] = useState(false);
  const [autoPhase, setAutoPhase] = useState<AutoPhase>("idle");
  const [autoOverride, setAutoOverride] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef<string | null>(null);
  const lastAutoReplyKeyRef = useRef<string>("");
  const autoReplyInFlightRef = useRef(false);

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
      setAutoPhase("idle");
      lastAutoReplyKeyRef.current = "";
      autoReplyInFlightRef.current = false;
    }
  }, [conversationId]);

  // ─── Auto-reply engine ───────────────────────────────────────────────────
  const executeAutoReply = useCallback(async (history: AIComposerMessage[]) => {
    if (!conversationId || !aiEnabled || autoReplyInFlightRef.current) return;
    autoReplyInFlightRef.current = true;
    setAutoPhase("typing");

    // Natural human-like delay before "typing"
    await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));

    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatId: conversationId,
          conversationHistory: history.slice(-12),
          aiMode: 'auto',
          ...(contactContext ? { contactContext } : {}),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const suggestion: string = data.suggestion || "";
        if (suggestion.trim()) {
          if (onAutoSend) {
            onAutoSend(suggestion);
          } else {
            // Fallback: set value + send via parent
            onChange(suggestion);
            setTimeout(onSend, 80);
          }
          setAutoPhase("replied");
          setTimeout(() => setAutoPhase("waiting"), 5000);
        } else {
          setAutoPhase("waiting");
        }
      } else {
        setAutoPhase("waiting");
      }
    } catch {
      setAutoPhase("waiting");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  }, [conversationId, aiEnabled, contactContext, onAutoSend, onChange, onSend]);

  // Watch messages: when in auto mode and last message is from lead → auto-reply
  const lastMsg = messages[messages.length - 1];
  const lastMsgKey = messages.length > 0 ? `${messages.length}::${lastMsg?.content ?? ""}` : "";
  const lastMsgIsFromLead = lastMsg?.role === "user";

  useEffect(() => {
    if (aiMode !== "auto" || autoOverride) return;
    if (!lastMsgIsFromLead) return;
    if (lastMsgKey === lastAutoReplyKeyRef.current) return; // already handled

    lastAutoReplyKeyRef.current = lastMsgKey;
    executeAutoReply(messages);
  }, [aiMode, autoOverride, lastMsgKey, lastMsgIsFromLead, messages, executeAutoReply]);
  // ─────────────────────────────────────────────────────────────────────────

  const fetchSuggestion = useCallback(async () => {
    if (!conversationId || !aiEnabled || aiCooldown) return;
    setIsDrafting(true);
    setAiDraft(null);
    onChange("");
    setAiCooldown(true);
    setTimeout(() => setAiCooldown(false), 3000);

    // Demo mode: simulate a realistic reply without a real API call
    if (demoMode) {
      await new Promise(r => setTimeout(r, 900 + Math.random() * 600));
      const demo = DEMO_SUGGESTIONS[_demoCycleIdx % DEMO_SUGGESTIONS.length];
      _demoCycleIdx++;
      setAiDraft(demo);
      onChange(demo);
      setIsDrafting(false);
      return;
    }

    try {
      const res = await fetch("/api/ai/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          chatId: conversationId,
          conversationHistory: messages.slice(-12),
          ...(contactContext ? { contactContext } : {}),
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
  }, [conversationId, aiEnabled, demoMode, aiCooldown, messages, contactContext, onChange]);

  const handleModeChange = (mode: AIMode) => {
    setAiMode(mode);
    setAiDraft(null);
    setIsDrafting(false);
    setAutoOverride(false);
    onChange("");

    if (mode === "suggest" && aiEnabled) fetchSuggestion();

    if (mode === "auto") {
      setAutoPhase("idle");
      // Reset key so the effect will fire for the current last message
      lastAutoReplyKeyRef.current = "";
      autoReplyInFlightRef.current = false;
    }
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

  // ─── Status line text ────────────────────────────────────────────────────
  const statusLineText = (() => {
    if (isSuggestMode) {
      if (isDrafting) return "AI is drafting a reply…";
      if (aiDraft) return "AI reply ready — edit or send";
      return "Switching to AI Suggest…";
    }
    if (isAutoPassive) {
      if (autoPhase === "typing") return "AI is typing…";
      if (autoPhase === "replied") return "AI replied — waiting for customer response";
      return "Waiting for customer response…";
    }
    return null;
  })();

  const statusIsSpinning = isDrafting || (isAutoPassive && autoPhase === "typing");

  // ─── Auto-passive icon & label ───────────────────────────────────────────
  const AutoIcon = autoPhase === "typing"
    ? Loader2
    : autoPhase === "replied"
    ? CheckCircle2
    : Clock;

  const autoLabel =
    autoPhase === "typing"
      ? "AI is typing a reply…"
      : autoPhase === "replied"
      ? "AI replied — waiting for response"
      : autoPhase === "idle"
      ? "AI is ready to respond"
      : "Waiting for customer response…";

  return (
    <div className={cn("border-t border-gray-200 bg-white shrink-0", className)}>

      {/* Subtle AI status line */}
      {aiEnabled && statusLineText && (
        <div className="px-4 py-1 flex items-center gap-1.5 bg-gray-50/60 border-b border-gray-100">
          <Sparkles className="w-2.5 h-2.5 text-purple-400 shrink-0" />
          <span className="text-[10px] text-gray-400 italic tracking-wide">{statusLineText}</span>
          {statusIsSpinning && (
            <Loader2 className="w-2.5 h-2.5 text-purple-400 animate-spin ml-0.5 shrink-0" />
          )}
        </div>
      )}

      <div className="px-3 pt-1.5 pb-2 flex flex-col gap-1.5">

        {/* Row 1: AI mode pills + credit badge */}
        {showAIModes && (
          <div className="flex items-center gap-1 flex-wrap" data-testid="ai-mode-selector">
            {(["manual", "suggest", "auto"] as AIMode[]).map((mode) => {
              const label  = mode === "manual" ? "Manual" : mode === "suggest" ? "Suggest" : "Auto";
              const Icon   = mode === "manual" ? User : mode === "suggest" ? Sparkles : Zap;
              const active = aiMode === mode;

              // Capability gate
              const modeEnabled =
                mode === "manual"  ? true :
                mode === "suggest" ? effectiveCanSuggest :
                effectiveCanAuto;

              const lockReason =
                !modeEnabled && mode === "suggest" && capabilities?.plan === "free"
                  ? "Unlock AI Assist to draft replies"
                  : !modeEnabled && mode === "auto" && capabilities?.plan === "starter"
                  ? "Unlock AI Autopilot to reply automatically"
                  : !modeEnabled && (capabilities?.isExhausted)
                  ? "AI replies exhausted this month — upgrade for more"
                  : !modeEnabled
                  ? "Upgrade to unlock"
                  : null;

              return (
                <button
                  key={mode}
                  onClick={() => modeEnabled ? handleModeChange(mode) : undefined}
                  disabled={!modeEnabled}
                  title={lockReason ?? undefined}
                  data-testid={`composer-ai-mode-${mode}`}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all",
                    active && modeEnabled
                      ? "bg-purple-600 text-white shadow-sm"
                      : modeEnabled
                      ? "text-gray-400 hover:text-gray-600 hover:bg-gray-100 border border-gray-200 bg-white"
                      : "text-gray-300 border border-gray-100 bg-gray-50 cursor-not-allowed opacity-60"
                  )}
                >
                  {!modeEnabled ? (
                    <Lock className="w-2.5 h-2.5 shrink-0 text-gray-300" />
                  ) : (
                    <Icon className="w-2.5 h-2.5 shrink-0" />
                  )}
                  {label}
                </button>
              );
            })}

            {/* Credit badge — shown when >75% used */}
            {capabilities && (
              <AICreditBadge
                creditsRemaining={capabilities.creditsRemaining}
                monthlyLimit={capabilities.monthlyLimit}
                creditPercent={capabilities.creditPercent}
                planName={capabilities.planName}
              />
            )}
          </div>
        )}

        {/* Upgrade prompt — shown when credits are exhausted and user needs AI */}
        {capabilities?.isExhausted && capabilities.upgradePlan && (
          <AIUpgradePrompt
            feature="unlimited AI replies"
            requiredPlan={capabilities.upgradePlan}
            reason={`You've used all ${capabilities.monthlyLimit} AI replies for this month. More credits reset on your billing cycle.`}
            size="sm"
            className="mt-0.5"
          />
        )}

        {/* Row 2: Auto-passive panel or Textarea */}
        {isAutoPassive ? (
          <div
            onClick={handleAutoOverride}
            data-testid="auto-mode-passive-input"
            className={cn(
              "flex items-center gap-2.5 w-full rounded-xl px-3.5 py-3 cursor-pointer select-none transition-colors",
              autoPhase === "typing"
                ? "bg-purple-50 border border-purple-200"
                : "bg-gray-50 border border-gray-200 hover:bg-gray-100/60"
            )}
            style={{ minHeight: MIN_TEXTAREA_HEIGHT }}
          >
            <AutoIcon
              className={cn(
                "w-4 h-4 shrink-0",
                autoPhase === "typing"
                  ? "text-purple-500 animate-spin"
                  : autoPhase === "replied"
                  ? "text-emerald-500"
                  : "text-gray-400"
              )}
            />
            <span
              className={cn(
                "italic flex-1 leading-relaxed text-[13px]",
                autoPhase === "typing" ? "text-purple-600" : "text-gray-500"
              )}
            >
              {autoLabel}
            </span>
            <span className="text-[10px] text-purple-400 not-italic font-medium whitespace-nowrap opacity-70">
              Click to take over
            </span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            placeholder={
              isSuggestMode && isDrafting
                ? "AI is drafting…"
                : "Type a message… (Enter to send, Shift+Enter for new line)"
            }
            className={cn(
              "w-full border rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed focus:outline-none transition-colors resize-none overflow-y-auto",
              isSuggestMode && (isDrafting || aiDraft)
                ? "bg-violet-50/30 border-purple-200/70 focus:border-purple-300 text-gray-800"
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
          <div className="flex items-center gap-1 text-gray-400">
            <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  className="p-1.5 rounded-md hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  data-testid="button-emoji"
                >
                  <Smile className="h-4 w-4" />
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
                  className="p-1.5 rounded-md hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  data-testid="button-attach-file"
                >
                  <Paperclip className="h-4 w-4" />
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

          {/* Right: regenerate + send (hidden in auto passive) */}
          {!isAutoPassive && (
            <div className="flex items-center gap-2">
              {isSuggestMode && !isDrafting && aiDraft && (
                <button
                  onClick={fetchSuggestion}
                  disabled={aiCooldown}
                  className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-30"
                  data-testid="button-regenerate-ai"
                >
                  <RefreshCw className={cn("w-3 h-3", aiCooldown && "animate-spin")} />
                  Regenerate
                </button>
              )}
              <button
                onClick={onSend}
                className="h-8 px-3.5 bg-brand-green hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 text-white text-xs font-semibold transition-colors shadow-sm"
                data-testid="button-send-message"
              >
                <Send className="h-3 w-3" />
                Send
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
