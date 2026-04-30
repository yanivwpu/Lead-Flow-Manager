import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  LayoutTemplate,
  Timer,
  Brain,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "emoji-picker-react";
import { cn } from "@/lib/utils";
import { AICreditBadge, AIUpgradePrompt } from "./AIUpgradePrompt";
import type { AICapabilities } from "@/lib/useAICapabilities";
import { useIsMobile } from "@/hooks/use-mobile";
import type { LucideIcon } from "lucide-react";

type AIMode = "manual" | "suggest" | "auto";
type AutoPhase = "idle" | "typing" | "replied" | "waiting";

export interface AIComposerMessage {
  role: "user" | "assistant";
  content: string;
  /** When provided, waiting-state UI uses this (aligned with `Message.direction`). */
  direction?: "inbound" | "outbound";
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
  /** Business AI mode from `/api/ai/settings` (off | suggest | auto). Source of truth for Full Auto. */
  businessAiMode?: "off" | "suggest" | "auto";
  /** Optional list of handoff keywords for local pre-check before calling AI. */
  handoffKeywords?: string[];
  /** Contact id for `[AI-AUTO]` logs (inbox CRM contact, not conversation id). */
  contactId?: string | null;
  /** CRM context injected into AI prompt to improve reply quality */
  contactContext?: ContactContext;
  conversationId: string | null;
  messages: AIComposerMessage[];
  demoMode?: boolean;
  setTyping?: (typing: boolean) => void;
  typingTimeoutRef?: React.MutableRefObject<NodeJS.Timeout | null>;
  fileInputRef?: React.RefObject<HTMLInputElement>;
  handleFileSelect?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Opens the inline template picker for WhatsApp template sends */
  onTemplate?: () => void;
  className?: string;
  /** Meta reply-window hint (Inbox only); merged into composer chip bar. */
  metaReplyWindowNotice?: { variant: "soon" | "expired"; text: string } | null;
}

const MIN_TEXTAREA_HEIGHT = 58;
const MAX_TEXTAREA_HEIGHT = 160;

/**
 * Subtle notice when auto-send was blocked. Returns null to hide the row (no misleading generic copy).
 * When the server reports strong intent, we never show a warning — avoids contradicting clear user behavior.
 */
function autoSkipNoticeForReason(
  gateReason: string,
  opts: { strongIntent: boolean }
): string | null {
  if (opts.strongIntent) return null;
  if (gateReason === "missing_required_gt_one") {
    return "Waiting for missing details";
  }
  if (gateReason === "low_confidence") {
    return "Low confidence — waiting for more signals";
  }
  return null;
}

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
  onTemplate,
  className,
  businessAiMode = "suggest",
  handoffKeywords,
  contactId = null,
  metaReplyWindowNotice = null,
}: AIComposerProps) {
  const isMobile = useIsMobile();
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
  /** After auto-send was blocked but we have suggestion text — show composer instead of passive panel. */
  const [autoSkippedWithDraft, setAutoSkippedWithDraft] = useState(false);
  const [autoSendBlockedMessage, setAutoSendBlockedMessage] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIdRef = useRef<string | null>(null);
  const lastAutoReplyKeyRef = useRef<string>("");
  const lastSuggestDraftKeyRef = useRef<string>("");
  /** User chose Manual while workspace default is suggest — don't force Suggest back on settings sync. */
  const userLockedManualRef = useRef(false);
  const autoReplyInFlightRef = useRef(false);

  // Auto-resize textarea — avoid height-auto jump on mobile by reading scrollHeight before reset
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    // Briefly set overflow-y hidden to avoid scrollbar flash during resize
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_TEXTAREA_HEIGHT), MAX_TEXTAREA_HEIGHT);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

  // Reset when conversation changes
  useEffect(() => {
    if (conversationId !== prevIdRef.current) {
      prevIdRef.current = conversationId;
      setAiDraft(null);
      setIsDrafting(false);
      setAutoOverride(false);
      setAutoPhase("idle");
      setAutoSkippedWithDraft(false);
      setAutoSendBlockedMessage(null);
      lastAutoReplyKeyRef.current = "";
      lastSuggestDraftKeyRef.current = "";
      userLockedManualRef.current = false;
      autoReplyInFlightRef.current = false;
    }
  }, [conversationId]);

  // Sync composer mode from business settings (Full Auto only when business + plan allow).
  useEffect(() => {
    if (autoOverride) return;
    if (!showAIModes) {
      setAiMode("manual");
      return;
    }
    if (businessAiMode === "off") {
      setAiMode("manual");
      return;
    }
    if (businessAiMode === "auto") {
      setAiMode(effectiveCanAuto ? "auto" : "suggest");
      return;
    }
    if (businessAiMode === "suggest") {
      if (userLockedManualRef.current) {
        setAiMode("manual");
        return;
      }
      setAiMode(effectiveCanSuggest ? "suggest" : "manual");
      return;
    }
  }, [autoOverride, businessAiMode, effectiveCanAuto, effectiveCanSuggest, showAIModes]);

  // ─── Auto-reply engine ───────────────────────────────────────────────────
  const executeAutoReply = useCallback(async (history: AIComposerMessage[]) => {
    if (!conversationId || !aiEnabled || autoReplyInFlightRef.current) return;
    autoReplyInFlightRef.current = true;
    setAutoPhase("typing");
    setAutoSendBlockedMessage(null);
    setAutoSkippedWithDraft(false);

    // Local handoff pre-check (cheap + immediate). If the latest inbound matches, do NOT call AI.
    const lastInboundText = (() => {
      const inbound = history.filter((m) => m.role === "user").map((m) => m.content || "");
      return (inbound[inbound.length - 1] || "").trim();
    })();
    if (lastInboundText && handoffKeywords && handoffKeywords.length > 0) {
      const msgLower = lastInboundText.toLowerCase();
      const matched = handoffKeywords
        .map((k) => String(k || "").trim())
        .filter(Boolean)
        .some((k) => msgLower.includes(k.toLowerCase()));
      if (matched) {
        console.info("[HANDOFF_TRIGGERED]", {
          contactId: contactId || "unknown",
          matchedKeyword: "client_precheck",
          message: lastInboundText.slice(0, 500),
        });
        setAutoPhase("waiting");
        autoReplyInFlightRef.current = false;
        return;
      }
    }

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
        const allowed = data.autoSendAllowed === true;
        const reason = typeof data.autoSendReason === "string" ? data.autoSendReason : "unknown";
        const strongIntent = data.autoSendStrongIntent === true;
        const confidence = typeof data.confidence === "number" ? data.confidence : 0;
        const trimmed = suggestion.trim();
        const willSend = allowed && trimmed.length > 5 && !!onAutoSend;
        let clientReason = reason;
        if (willSend) clientReason = "send_ok";
        else if (!allowed) clientReason = reason;
        else if (trimmed.length <= 5) clientReason = "suggestion_too_short";
        else if (!onAutoSend) clientReason = "missing_onAutoSend_callback";
        console.info("[AI-AUTO-CLIENT]", {
          mode: "auto",
          autoSendAllowed: allowed,
          reason: clientReason,
          serverReason: reason,
          suggestionLength: trimmed.length,
          contactId: contactId || "unknown",
          confidence,
        });

        if (willSend && onAutoSend) {
          onAutoSend(suggestion);
          setAutoPhase("replied");
          setTimeout(() => setAutoPhase("waiting"), 5000);
        } else {
          // Stay in Auto; block only this send. Surface suggestion for manual review when available.
          if (trimmed.length > 0) {
            setAiDraft(trimmed);
            onChange(trimmed);
            setAutoSkippedWithDraft(true);
          } else {
            setAutoSkippedWithDraft(false);
          }

          let effectiveReason = reason;
          if (allowed && trimmed.length <= 5) {
            effectiveReason = "missing_or_trivial_suggestion";
          } else if (allowed && !onAutoSend) {
            effectiveReason = "missing_onAutoSend_callback";
          } else if (!allowed) {
            effectiveReason = reason;
          }

          setAutoSendBlockedMessage(autoSkipNoticeForReason(effectiveReason, { strongIntent }));
          setAutoPhase("waiting");
        }
      } else {
        console.info("[AI-AUTO-CLIENT]", {
          mode: "auto",
          autoSendAllowed: false,
          reason: "suggest_reply_request_failed",
          httpStatus: res.status,
          suggestionLength: 0,
          contactId: contactId || "unknown",
        });
        setAutoSkippedWithDraft(false);
        setAutoSendBlockedMessage(null);
        setAutoPhase("waiting");
      }
    } catch {
      console.info("[AI-AUTO-CLIENT]", {
        mode: "auto",
        autoSendAllowed: false,
        reason: "suggest_reply_exception",
        suggestionLength: 0,
        contactId: contactId || "unknown",
      });
      setAutoSkippedWithDraft(false);
      setAutoSendBlockedMessage(null);
      setAutoPhase("waiting");
    } finally {
      autoReplyInFlightRef.current = false;
    }
  }, [conversationId, aiEnabled, contactContext, contactId, handoffKeywords, onAutoSend]);

  // Watch messages: when in auto mode and last message is from lead → auto-reply
  const lastMsg = messages[messages.length - 1];
  const lastMsgKey = messages.length > 0 ? `${messages.length}::${lastMsg?.content ?? ""}` : "";
  /** Recomputed every render from latest `messages` (refetches / WS / polling). */
  const lastTurnIsInbound = (() => {
    const m = messages[messages.length - 1];
    if (!m) return false;
    if (m.direction === "inbound") return true;
    if (m.direction === "outbound") return false;
    return m.role === "user";
  })();
  const lastTurnIsOutbound = (() => {
    const m = messages[messages.length - 1];
    if (!m) return false;
    if (m.direction === "outbound") return true;
    if (m.direction === "inbound") return false;
    return m.role === "assistant";
  })();

  // Customer sent the latest turn → clear stale "waiting"/"replied" phase so UI matches the thread.
  useEffect(() => {
    if (aiMode !== "auto" || autoOverride) return;
    if (!lastTurnIsInbound) return;
    if (autoPhase === "waiting" || autoPhase === "replied") {
      setAutoPhase("idle");
    }
  }, [aiMode, autoOverride, lastTurnIsInbound, autoPhase]);

  useEffect(() => {
    if (aiMode !== "auto" || autoOverride) return;
    if (!lastTurnIsInbound) return;
    if (lastMsgKey === lastAutoReplyKeyRef.current) return; // already handled

    lastAutoReplyKeyRef.current = lastMsgKey;
    executeAutoReply(messages);
  }, [aiMode, autoOverride, lastMsgKey, lastTurnIsInbound, messages, executeAutoReply]);
  // ─────────────────────────────────────────────────────────────────────────

  /** Suggest mode: load editable AI draft when the latest turn is a new inbound message. */
  const loadSuggestDraftForInbound = useCallback(
    async (history: AIComposerMessage[]) => {
      if (!conversationId || !aiEnabled) return;
      setIsDrafting(true);
      setAiDraft(null);
      onChange("");
      if (demoMode) {
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 400));
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
            conversationHistory: history.slice(-12),
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
    },
    [conversationId, aiEnabled, demoMode, contactContext, onChange],
  );

  useEffect(() => {
    if (aiMode !== "suggest" || !aiEnabled || !conversationId || autoOverride) return;
    if (!lastTurnIsInbound) return;
    if (lastMsgKey === lastSuggestDraftKeyRef.current) return;
    lastSuggestDraftKeyRef.current = lastMsgKey;
    loadSuggestDraftForInbound(messages);
  }, [
    aiMode,
    aiEnabled,
    conversationId,
    autoOverride,
    lastMsgKey,
    lastTurnIsInbound,
    messages,
    loadSuggestDraftForInbound,
  ]);

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
    if (mode === "manual") userLockedManualRef.current = true;
    if (mode === "suggest" || mode === "auto") userLockedManualRef.current = false;
    setAiDraft(null);
    setIsDrafting(false);
    setAutoOverride(false);
    setAutoSkippedWithDraft(false);
    setAutoSendBlockedMessage(null);
    onChange("");

    if (mode === "suggest" && aiEnabled) {
      lastSuggestDraftKeyRef.current = "";
      fetchSuggestion();
    }

    if (mode === "auto") {
      setAutoPhase("idle");
      // Reset key so the effect will fire for the current last message
      lastAutoReplyKeyRef.current = "";
      autoReplyInFlightRef.current = false;
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    if (aiMode === "suggest" && aiEnabled && !v.trim()) setAiDraft(null);
    onChange(v);
    if (setTyping) {
      setTyping(true);
      if (typingTimeoutRef?.current) clearTimeout(typingTimeoutRef.current);
      if (typingTimeoutRef) typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    }
  };

  const canSend = value.trim().length > 0;

  const handleSendClick = () => {
    if (!canSend) return;
    onSend();
    if (aiMode === "suggest") {
      setAiDraft(null);
      lastSuggestDraftKeyRef.current = "";
    }
    if (aiMode === "auto") {
      setAutoSkippedWithDraft(false);
      setAutoSendBlockedMessage(null);
    }
    if (isMobile) {
      requestAnimationFrame(() => textareaRef.current?.blur());
    } else {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // On mobile, the virtual keyboard's Enter key should insert a newline,
    // not send the message. Users send via the send button instead.
    // On desktop, Enter sends; Shift+Enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      if (!canSend) return;
      e.preventDefault();
      if (setTyping) setTyping(false);
      handleSendClick();
    }
  };

  const handleAutoOverride = () => {
    setAutoOverride(true);
    userLockedManualRef.current = true;
    setAiMode("manual");
    setAutoSkippedWithDraft(false);
    setAutoSendBlockedMessage(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  /** Passive Auto panel (click to take over) — hidden when we need to show a skipped-auto draft in the textarea. */
  const isAutoPassive = aiMode === "auto" && !autoOverride && !autoSkippedWithDraft;
  const isSuggestMode = aiMode === "suggest" && aiEnabled;

  // ─── Auto-passive icon & label ───────────────────────────────────────────
  const AutoIcon = autoPhase === "typing"
    ? Loader2
    : autoPhase === "replied"
    ? CheckCircle2
    : Clock;

  const autoLabel = (() => {
    if (autoPhase === "typing") return "Typing a reply…";
    // Latest message from customer → we're not waiting on them (updates every time `messages` changes).
    if (lastTurnIsInbound) return "Ready to respond";
    if (autoPhase === "replied") return "⚡ Auto-replied — waiting for response";
    if (lastTurnIsOutbound) return "Waiting for customer response…";
    return "Ready to respond";
  })();

  return (
    <div className={cn("border-t border-gray-200 bg-white shrink-0", className)}>

      <div className="px-3 pt-1.5 pb-2 flex flex-col gap-1.5">

        {/* Row 1: AI mode pills + credit badge */}
        {showAIModes && (
          <div className="flex items-center gap-1 flex-wrap" data-testid="ai-mode-selector">
            {(["manual", "suggest", "auto"] as AIMode[]).map((mode) => {
              const label  = mode === "manual" ? "Manual" : mode === "suggest" ? "Suggest" : "Auto";
              const Icon   = mode === "manual" ? User : mode === "suggest" ? Sparkles : Zap;
              const active = aiMode === mode;

              // Capability + business-settings gate (Full Auto only when business mode is auto)
              const modeEnabled =
                mode === "manual"  ? true :
                mode === "suggest" ? effectiveCanSuggest && businessAiMode !== "off" :
                effectiveCanAuto && businessAiMode === "auto";

              const lockReason =
                !modeEnabled && mode === "suggest" && capabilities?.plan === "free"
                  ? "Unlock Suggest to draft replies"
                  : !modeEnabled && mode === "auto" && capabilities?.plan === "starter"
                  ? "Unlock Autopilot to reply automatically"
                  : !modeEnabled && (capabilities?.isExhausted)
                  ? "Monthly replies exhausted — upgrade for more"
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

        {/* Suggest mode: primary draft lives in the composer */}
        {isSuggestMode && !isDrafting && Boolean(aiDraft) && value.trim().length > 0 && (
          <p
            className="text-[11px] text-violet-800/90 flex items-center gap-1.5 px-0.5 -mt-0.5"
            data-testid="composer-ai-draft-hint"
          >
            <span aria-hidden>✨</span>
            <span className="font-medium">AI draft ready — edit or send</span>
          </p>
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
                : isMobile
                  ? "Type a message…"
                  : "Type a message… (Enter to send, Shift+Enter for new line)"
            }
            className={cn(
              "w-full border rounded-xl px-3.5 py-2.5 text-base md:text-[13px] leading-relaxed focus:outline-none transition-colors resize-none",
              (isSuggestMode && (isDrafting || aiDraft)) ||
                (aiMode === "auto" && autoSkippedWithDraft && value.trim())
                ? "bg-violet-50/30 border-purple-200/70 focus:border-purple-300 text-gray-800"
                : "bg-white border-gray-200 focus:border-brand-green text-gray-800"
            )}
            style={{ minHeight: MIN_TEXTAREA_HEIGHT, maxHeight: MAX_TEXTAREA_HEIGHT, touchAction: "manipulation" }}
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
                  accept="image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp3,audio/m4a,audio/x-m4a,audio/ogg,video/mp4"
                  onChange={handleFileSelect}
                />
              </>
            )}

            {onTemplate && (
              <button
                onClick={onTemplate}
                className="p-1.5 rounded-md hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="Send a WhatsApp template"
                data-testid="button-use-template"
              >
                <LayoutTemplate className="h-4 w-4" />
              </button>
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
                type="button"
                onClick={handleSendClick}
                disabled={!canSend}
                className={cn(
                  "px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-white text-xs font-semibold transition-all",
                  "bg-emerald-600/90 shadow-none",
                  "hover:bg-emerald-700 hover:shadow-sm",
                  "disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:hover:bg-emerald-600/90 disabled:hover:shadow-none",
                )}
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
