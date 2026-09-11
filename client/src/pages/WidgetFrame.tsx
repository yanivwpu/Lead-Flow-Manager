import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRoute, useSearch } from "wouter";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { NoIndexHelmet } from "@/components/NoIndexHelmet";
import { loadOrRotateWebchatVisitorId } from "@shared/webchatVisitorId";
import { WebchatMediaBubble } from "@/components/webchat/WebchatMediaBubble";
import { WebchatFormCard } from "@/components/webchat/WebchatFormCard";
import {
  WebchatMessageErrorBoundary,
  WidgetFrameErrorBoundary,
} from "@/components/webchat/WidgetFrameErrorBoundary";
import { WEBCHAT_IMAGE_MAX_BYTES } from "@shared/webchatImagePolicy";
import { sanitizeWebchatFormDefinition, type WebchatFormDefinition } from "@shared/webchatStructuredForm";
import { WebchatPanelHeader } from "@/components/webchat/WebchatPanelHeader";
import {
  resolvePublicWebchatPresentation,
  widgetLogoAllowedHttpsHosts,
  type PublicWebchatPresentation,
} from "@shared/webchatWidgetBranding";
import {
  WEBCHAT_POLL_BACKOFF_MS,
  WEBCHAT_POLL_HIDDEN_MS,
  WEBCHAT_POLL_VISIBLE_MS,
} from "@shared/webchatPollPolicy";
import {
  decideWebchatScrollAction,
  mergeWebchatPolledMessages,
  webchatIsNearBottom,
  webchatMessageIds,
} from "@shared/webchatWidgetScroll";

interface ButtonOption {
  label: string;
  value: string;
  nextNodeId?: string;
}

interface ChatMessage {
  id: string;
  direction: "inbound" | "outbound";
  content: string | null;
  contentType: string;
  mediaUrl: string | null;
  createdAt: string;
  status?: string | null;
  templateVariables?: {
    chatbotButtons?: ButtonOption[];
    webchatForm?: WebchatFormDefinition;
  } | null;
}

const POLL_INTERVAL = WEBCHAT_POLL_VISIBLE_MS;

export type WebchatWidgetProps = {
  widgetId: string;
  /**
   * When set, `/api/webchat/.../settings` matches `pageRules` against this URL (hosted `/chat` page).
   * If omitted, optional query `parentUrl` on the iframe URL is used the same way (script-based iframe install).
   */
  resolvePageHref?: string | null;
};

/**
 * Embeddable web chat (used by `/widget-frame/:id` iframe and full-page `/chat/:id` hosted link).
 */
export function WebchatWidget({ widgetId, resolvePageHref }: WebchatWidgetProps) {
  const searchString = useSearch();
  const urlGreeting = useMemo(() => {
    try {
      return new URLSearchParams(searchString).get("greeting");
    } catch {
      return null;
    }
  }, [searchString]);
  const urlPrefill = useMemo(() => {
    try {
      return new URLSearchParams(searchString).get("prefill");
    } catch {
      return null;
    }
  }, [searchString]);
  const urlLeadSource = useMemo(() => {
    try {
      return new URLSearchParams(searchString).get("source");
    } catch {
      return null;
    }
  }, [searchString]);

  /** Parent page URL passed by script embed so page rules can match the host site, not the iframe path. */
  const parentUrlForRules = useMemo(() => {
    try {
      const raw = new URLSearchParams(searchString).get("parentUrl");
      if (!raw?.trim()) return null;
      return raw.trim().slice(0, 4000);
    } catch {
      return null;
    }
  }, [searchString]);

  const ruleMatchHref = useMemo(() => {
    if (resolvePageHref != null && resolvePageHref !== "") return resolvePageHref;
    return parentUrlForRules;
  }, [resolvePageHref, parentUrlForRules]);

  /** Parent site URL for origin/page-rule checks — never the iframe host. */
  const parentPageHref = useMemo(() => {
    const preferred = ruleMatchHref != null && ruleMatchHref !== "" ? ruleMatchHref : "";
    if (preferred) return preferred.slice(0, 4000);
    if (typeof document === "undefined") return null;
    const referrer = String(document.referrer || "").trim();
    if (!referrer) return null;
    try {
      const parsed = new URL(referrer);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return referrer.slice(0, 4000);
    } catch {
      return null;
    }
  }, [ruleMatchHref]);
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<PublicWebchatPresentation>(() =>
    resolvePublicWebchatPresentation({ settings: {} }),
  );
  const widgetColor = presentation.color;
  const accentColor = presentation.accentColor;
  const accentTextColor = presentation.accentForeground;
  const [settingsWelcome, setSettingsWelcome] = useState(
    "Hi! How can we help you today?"
  );
  const [apiPrefill, setApiPrefill] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [leadForm, setLeadForm] = useState<WebchatFormDefinition | null>(null);
  const [submittedFormIds, setSubmittedFormIds] = useState<Set<string>>(new Set());
  const [clickedButtons, setClickedButtons] = useState<Set<string>>(new Set());
  const [widgetUnavailable, setWidgetUnavailable] = useState(false);
  const [pollError, setPollError] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUploadsRef = useRef<Map<string, File>>(new Map());
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollBackoffIndexRef = useRef(0);
  const stickToBottomRef = useRef(true);
  const prevMessageIdsRef = useRef<string[]>([]);
  const revealedFormIdsRef = useRef<Set<string>>(new Set());
  const userInitiatedScrollRef = useRef(false);
  const expectFormConfirmationRef = useRef(false);
  const preserveScrollTopRef = useRef<number | null>(null);
  const userId = widgetId;

  // Init: get/create visitorId from localStorage
  useEffect(() => {
    if (!userId) return;
    const storageKey = `wchat_visitor_${userId}`;
    const stored = localStorage.getItem(storageKey);
    const { visitorId: vid } = loadOrRotateWebchatVisitorId(stored);
    localStorage.setItem(storageKey, vid);
    setVisitorId(vid);

    const settingsUrl =
      parentPageHref != null && parentPageHref !== ""
        ? `/api/webchat/${userId}/settings?href=${encodeURIComponent(parentPageHref)}`
        : `/api/webchat/${userId}/settings`;

    fetch(settingsUrl, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          setWidgetUnavailable(true);
          setIsLoading(false);
          return;
        }
        const data = await r.json();
        const settings = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const nextPresentation = resolvePublicWebchatPresentation({
          settings,
          businessName: typeof data?.businessName === "string" ? data.businessName : "",
          agentName: typeof data?.agentName === "string" ? data.agentName : "",
          chatGreeting: typeof data?.chatGreeting === "string" ? data.chatGreeting : undefined,
          chatPrefill: typeof data?.chatPrefill === "string" ? data.chatPrefill : undefined,
          suggestedQuestions: Array.isArray(data?.suggestedQuestions)
            ? data.suggestedQuestions
            : undefined,
          ctaLabel: typeof data?.ctaLabel === "string" ? data.ctaLabel : undefined,
          ctaUrl: typeof data?.ctaUrl === "string" ? data.ctaUrl : undefined,
          appOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
          allowedLogoHttpsHosts: widgetLogoAllowedHttpsHosts([
            typeof window !== "undefined" ? window.location.origin : "",
            typeof settings.logoUrl === "string" ? settings.logoUrl : "",
          ]),
        });
        setPresentation(nextPresentation);
        setSettingsWelcome(nextPresentation.chatGreeting || nextPresentation.welcomeMessage);
        if (typeof data?.chatPrefill === "string") setApiPrefill(data.chatPrefill);
        if (Array.isArray(data?.suggestedQuestions)) {
          setSuggestedQuestions(
            data.suggestedQuestions.filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0),
          );
        }
        if (typeof data?.ctaLabel === "string") setCtaLabel(data.ctaLabel);
        if (typeof data?.ctaUrl === "string") setCtaUrl(data.ctaUrl);
        setLeadForm(sanitizeWebchatFormDefinition(data?.leadForm));
        setWidgetUnavailable(false);
        setIsLoading(false);
      })
      .catch(() => {
        setWidgetUnavailable(true);
        setIsLoading(false);
      });
  }, [userId, parentPageHref]);

  useEffect(() => {
    const fromUrl = urlPrefill || "";
    const fromApi = apiPrefill || "";
    const prefill = fromUrl || fromApi;
    if (prefill) setInputText(prefill);
  }, [urlPrefill, apiPrefill]);

  const fetchMessages = useCallback(async (): Promise<boolean> => {
    if (!userId || !visitorId) return false;
    try {
      const qs =
        parentPageHref != null && parentPageHref !== ""
          ? `?href=${encodeURIComponent(parentPageHref)}`
          : "";
      const res = await fetch(`/api/webchat/${userId}/${visitorId}/messages${qs}`);
      if (!res.ok) {
        setPollError(true);
        return false;
      }
      const data: unknown = await res.json();
      if (!Array.isArray(data)) {
        setPollError(true);
        return false;
      }
      setPollError(false);
      const incoming = data.filter((m: unknown): m is ChatMessage => {
        if (!m || typeof m !== "object") return false;
        const row = m as ChatMessage;
        if (typeof row.id !== "string" || !row.id) return false;
        if (row.direction !== "inbound" && row.direction !== "outbound") return false;
        return row.direction !== "outbound" || row.status !== "failed";
      });
      setMessages((prev) => {
        const merged = mergeWebchatPolledMessages(prev, incoming);
        if (merged !== prev) {
          const scroller = scrollerRef.current;
          if (scroller && webchatMessageIds(prev).join("\n") === webchatMessageIds(merged).join("\n")) {
            preserveScrollTopRef.current = scroller.scrollTop;
          }
        }
        return merged;
      });
      return true;
    } catch {
      setPollError(true);
      return false;
    }
  }, [userId, visitorId, parentPageHref]);

  const fetchMessagesRef = useRef(fetchMessages);
  fetchMessagesRef.current = fetchMessages;

  // Visibility-aware poll: pause when hidden (WEBCHAT_POLL_HIDDEN_MS === 0), bounded backoff on errors.
  useEffect(() => {
    if (!visitorId || widgetUnavailable) return;
    let cancelled = false;

    const arm = (delayMs: number) => {
      if (pollRef.current) clearTimeout(pollRef.current);
      pollRef.current = setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const ok = await fetchMessagesRef.current();
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (ok) {
        pollBackoffIndexRef.current = 0;
        arm(POLL_INTERVAL);
        return;
      }
      const idx = Math.min(pollBackoffIndexRef.current, WEBCHAT_POLL_BACKOFF_MS.length - 1);
      pollBackoffIndexRef.current = Math.min(idx + 1, WEBCHAT_POLL_BACKOFF_MS.length - 1);
      arm(WEBCHAT_POLL_BACKOFF_MS[idx]);
    };

    const onVisibility = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        pollBackoffIndexRef.current = 0;
        void tick();
        return;
      }
      if (WEBCHAT_POLL_HIDDEN_MS === 0 && pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }
    if (typeof document === "undefined" || document.visibilityState === "visible") {
      void tick();
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [visitorId, widgetUnavailable]);

  const syncStickToBottom = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    stickToBottomRef.current = webchatIsNearBottom(
      scroller.scrollTop,
      scroller.scrollHeight,
      scroller.clientHeight,
    );
  }, []);

  const applyScrollDecision = useCallback((action: ReturnType<typeof decideWebchatScrollAction>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (action.action === "preserve") {
      if (preserveScrollTopRef.current != null) {
        scroller.scrollTop = preserveScrollTopRef.current;
        preserveScrollTopRef.current = null;
      }
      return;
    }
    preserveScrollTopRef.current = null;
    if (action.action === "bottom") {
      scroller.scrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
      stickToBottomRef.current = true;
      return;
    }
    if (action.action === "form-start" && action.messageId) {
      const target = scroller.querySelector(`[data-testid="webchat-form-msg-${action.messageId}"]`);
      if (target) target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
      else scroller.scrollTop = 0;
      stickToBottomRef.current = false;
      revealedFormIdsRef.current.add(action.messageId);
      return;
    }
    if (action.action === "confirmation" && action.messageId) {
      const target = scroller.querySelector(`[data-testid="msg-${action.messageId}"]`);
      target?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "auto" });
      expectFormConfirmationRef.current = false;
      syncStickToBottom();
    }
  }, [syncStickToBottom]);

  const deduped = useMemo(
    () =>
      Array.from(
        new Map(
          messages
            .filter((m) => typeof m?.id === "string" && m.id.length > 0)
            .map((m) => [m.id, m]),
        ).values(),
      ),
    [messages],
  );

  useLayoutEffect(() => {
    const decision = decideWebchatScrollAction({
      prevIds: prevMessageIdsRef.current,
      nextMessages: deduped,
      nearBottom: stickToBottomRef.current,
      userInitiated: userInitiatedScrollRef.current,
      alreadyRevealedFormIds: revealedFormIdsRef.current,
      expectConfirmation: expectFormConfirmationRef.current,
    });
    prevMessageIdsRef.current = webchatMessageIds(deduped);
    userInitiatedScrollRef.current = false;
    applyScrollDecision(decision);
  }, [deduped, applyScrollDecision]);

  useLayoutEffect(() => {
    if (!leadForm || submittedFormIds.has(leadForm.id)) return;
    if (deduped.some((m) => m.contentType === "form" || m.contentType === "form_result")) return;
    if (revealedFormIdsRef.current.has("__settings_lead_form__")) return;
    const target = scrollerRef.current?.querySelector('[data-testid="webchat-settings-lead-form"]');
    if (!target) return;
    target.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" });
    stickToBottomRef.current = false;
    revealedFormIdsRef.current.add("__settings_lead_form__");
  }, [leadForm, submittedFormIds, deduped]);

  const markFailed = useCallback((optId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === optId ? { ...m, status: "failed" } : m)),
    );
  }, []);

  const sendMessage = useCallback(async (text: string, retryId?: string, fileOverride?: File | null) => {
    const file = fileOverride || (!retryId ? pendingFile : pendingUploadsRef.current.get(retryId) || null);
    if ((!text.trim() && !file) || !userId || !visitorId || isSending || widgetUnavailable) return;
    setIsSending(true);
    const optId = retryId || `opt_${Date.now()}`;
    if (file) pendingUploadsRef.current.set(optId, file);
    userInitiatedScrollRef.current = true;
    if (retryId) {
      setMessages((prev) =>
        prev.map((m) => (m.id === retryId ? { ...m, status: undefined } : m)),
      );
    } else {
      const optimisticMsg: ChatMessage = {
        id: optId,
        direction: "inbound",
        content: text || null,
        contentType: file ? "image" : "text",
        mediaUrl: file ? URL.createObjectURL(file) : null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      setInputText("");
      setPendingFile(null);
      setAttachError(null);
    }

    try {
      const visitorLabel =
        urlLeadSource === "agent_page" ? "Agent Page Visitor" : "Website Visitor";
      const parentUrl = parentPageHref || (typeof window !== "undefined" ? window.location.href : undefined);
      let res: Response;
      if (file) {
        const form = new FormData();
        form.append("file", file);
        form.append("visitorId", visitorId);
        if (text.trim()) form.append("caption", text.trim());
        form.append("uploadId", optId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80));
        form.append("name", visitorLabel);
        if (urlLeadSource) form.append("source", urlLeadSource);
        if (parentUrl) form.append("parentUrl", parentUrl);
        if (typeof document !== "undefined") {
          form.append("pageTitle", document.title);
          if (document.referrer) form.append("referrer", document.referrer);
        }
        res = await fetch(`/api/webchat/${userId}/${visitorId}/media`, {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch(`/api/webchat/${userId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitorId,
            message: text,
            name: visitorLabel,
            source: urlLeadSource || undefined,
            parentUrl,
            pageTitle: typeof document !== "undefined" ? document.title : undefined,
            referrer: typeof document !== "undefined" ? document.referrer || undefined : undefined,
          }),
        });
      }
      if (!res.ok) {
        markFailed(optId);
        return;
      }
      pendingUploadsRef.current.delete(optId);
      await new Promise((r) => setTimeout(r, 800));
      await fetchMessages();
    } catch (e) {
      console.error("Send error", e);
      markFailed(optId);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [userId, visitorId, isSending, widgetUnavailable, fetchMessages, urlLeadSource, parentPageHref, markFailed, pendingFile]);

  const handleButtonClick = useCallback(async (msgId: string, btn: ButtonOption) => {
    // Prevent duplicate clicks
    const key = `${msgId}_${btn.value}`;
    if (clickedButtons.has(key)) return;
    setClickedButtons(prev => new Set([...prev, key]));

    // Also disable all buttons in this message
    setClickedButtons(prev => {
      const next = new Set(prev);
      next.add(msgId); // mark whole message as responded
      return next;
    });

    await sendMessage(btn.value);
  }, [clickedButtons, sendMessage]);

  const submitForm = useCallback(async (form: WebchatFormDefinition, values: Record<string, unknown>, messageId?: string) => {
    if (!userId || !visitorId || widgetUnavailable) throw new Error("Chat is unavailable.");
    const parentUrl = parentPageHref || (typeof window !== "undefined" ? window.location.href : undefined);
    const res = await fetch(`/api/webchat/${userId}/${visitorId}/forms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        formId: form.id,
        values,
        messageId,
        parentUrl,
        source: urlLeadSource || undefined,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data.error === "string" ? data.error : "Could not submit the form.");
    }
    setSubmittedFormIds((prev) => new Set([...prev, form.id]));
    expectFormConfirmationRef.current = true;
    await fetchMessages();
  }, [userId, visitorId, widgetUnavailable, parentPageHref, urlLeadSource, fetchMessages]);

  const handleAttachChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    const mime = (file.type || "").toLowerCase();
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime)) {
      setAttachError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > WEBCHAT_IMAGE_MAX_BYTES) {
      setAttachError("That image is too large.");
      return;
    }
    setAttachError(null);
    setPendingFile(file);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  if (!userId) {
    return (
      <div className="flex h-full w-full min-w-0 items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Widget not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <WebchatPanelHeader presentation={presentation} />

      {/* Messages */}
      <div
        ref={scrollerRef}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gray-50 p-3 space-y-2 [overflow-anchor:none]"
        data-testid="webchat-message-list"
        onScroll={syncStickToBottom}
      >
        {isLoading && (
          <div className="flex justify-center py-6" data-testid="webchat-loading">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: widgetColor }} />
          </div>
        )}
        {widgetUnavailable && !isLoading && (
          <p className="text-xs text-red-600" data-testid="text-settings-error" role="alert">
            Chat is unavailable. Please try again later.
          </p>
        )}
        {pollError && (
          <p className="text-xs text-amber-800" data-testid="text-poll-error" role="status">
            Couldn't refresh messages. Retrying…
          </p>
        )}
        {/* Welcome bubble */}
        {!isLoading && !widgetUnavailable && deduped.length === 0 && (
          <div className="flex justify-start">
            <div className="min-w-0 max-w-[75%] break-words bg-white text-gray-800 rounded-2xl rounded-bl-none px-3 py-2 text-sm shadow-sm border border-gray-100 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {urlGreeting || settingsWelcome}
            </div>
          </div>
        )}
        {!isLoading && !widgetUnavailable && deduped.length === 0 && suggestedQuestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                className="text-xs rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-700 hover:bg-gray-50"
                onClick={() => sendMessage(q)}
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {!isLoading && !widgetUnavailable && deduped.length === 0 && ctaLabel && ctaUrl && (
          <a
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex text-xs font-medium underline"
            style={{ color: accentColor }}
          >
            {ctaLabel}
          </a>
        )}

        {!isLoading && !widgetUnavailable && leadForm && !submittedFormIds.has(leadForm.id) && !deduped.some((m) => m.contentType === "form" || m.contentType === "form_result") && (
          <WebchatMessageErrorBoundary>
          <div data-testid="webchat-settings-lead-form">
          <WebchatFormCard
            form={leadForm}
            widgetColor={accentColor}
            accentForeground={accentTextColor}
            disabled={widgetUnavailable}
            onSubmit={(values) => submitForm(leadForm, values)}
          />
          </div>
          </WebchatMessageErrorBoundary>
        )}

        {deduped.map((msg) => {
          const isOutbound = msg.direction === "outbound";
          const sendFailed = !isOutbound && msg.status === "failed";
          const rawButtons = msg.templateVariables?.chatbotButtons;
          const buttons: ButtonOption[] = Array.isArray(rawButtons)
            ? rawButtons.filter(
                (btn): btn is ButtonOption =>
                  !!btn &&
                  typeof btn === "object" &&
                  typeof btn.label === "string" &&
                  typeof btn.value === "string",
              )
            : [];
          const isButtonMessage = msg.contentType === "buttons" && buttons.length > 0;
          const formDef = sanitizeWebchatFormDefinition(msg.templateVariables?.webchatForm);
          const isFormMessage = msg.contentType === "form" && !!formDef && isOutbound;
          const messageResponded = clickedButtons.has(msg.id);
          const formSubmitted = formDef ? submittedFormIds.has(formDef.id) || deduped.some((m) => m.contentType === "form_result") : false;

          return (
            <WebchatMessageErrorBoundary key={msg.id}>
            <div
              className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}
              data-testid={`msg-${msg.id}`}
            >
              <div className="min-w-0 max-w-[80%]">
                {msg.contentType === "image" && msg.mediaUrl ? (
                  <WebchatMediaBubble
                    src={msg.mediaUrl}
                    caption={msg.content}
                    isOutbound={isOutbound}
                    sendFailed={sendFailed}
                    widgetColor={accentColor}
                    accentForeground={accentTextColor}
                  />
                ) : (msg.content || msg.contentType === "buttons") ? (
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm shadow-sm break-words [overflow-wrap:anywhere] ${
                      isOutbound
                        ? "bg-white text-gray-800 rounded-bl-none border border-gray-100"
                        : sendFailed
                          ? "bg-red-50 text-gray-800 rounded-br-none border border-red-200"
                          : "rounded-br-none"
                    }`}
                    style={
                      !isOutbound && !sendFailed
                        ? { background: accentColor, color: accentTextColor }
                        : {}
                    }
                  >
                    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.content}</span>
                  </div>
                ) : null}

                {isFormMessage && formDef && (
                  <div className="mt-1.5 min-w-0" data-testid={`webchat-form-msg-${msg.id}`}>
                    <WebchatFormCard
                      form={formDef}
                      widgetColor={accentColor}
                      accentForeground={accentTextColor}
                      disabled={widgetUnavailable}
                      submitted={formSubmitted}
                      onSubmit={(values) => submitForm(formDef, values, msg.id)}
                    />
                  </div>
                )}
                {isButtonMessage && isOutbound && (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {buttons.map((btn, i) => {
                      const btnKey = `${msg.id}_${btn.value}`;
                      const isClicked = clickedButtons.has(btnKey) || messageResponded;
                      return (
                        <button
                          key={i}
                          onClick={() => handleButtonClick(msg.id, btn)}
                          disabled={isClicked}
                          data-testid={`chat-btn-${msg.id}-${i}`}
                          className={`w-full text-sm font-medium py-2 px-4 rounded-xl border transition-all ${
                            isClicked
                              ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                              : "bg-white border-gray-200 hover:border-opacity-80"
                          }`}
                          style={
                            !isClicked
                              ? {
                                  color: accentColor,
                                  borderColor: accentColor,
                                  borderWidth: "1.5px",
                                }
                              : {}
                          }
                          onMouseEnter={e => {
                            if (!isClicked) {
                              (e.target as HTMLButtonElement).style.background = accentColor;
                              (e.target as HTMLButtonElement).style.color = accentTextColor;
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isClicked) {
                              (e.target as HTMLButtonElement).style.background = "white";
                              (e.target as HTMLButtonElement).style.color = accentColor;
                            }
                          }}
                        >
                          {btn.label}
                        </button>
                      );
                    })}
                    {messageResponded && (
                      <p className="text-xs text-gray-400 text-center">Option selected</p>
                    )}
                  </div>
                )}
                {sendFailed && (
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <p className="text-xs text-red-600" data-testid="text-delivery-error">
                      Message could not be delivered.
                    </p>
                    <button
                      type="button"
                      data-testid="btn-retry-send"
                      disabled={isSending || widgetUnavailable}
                      className="text-xs font-medium text-red-700 underline disabled:opacity-40"
                      onClick={() => sendMessage(msg.content || "", msg.id)}
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>
            </div>
            </WebchatMessageErrorBoundary>
          );
        })}
      </div>

      {/* Input */}
      <div className="min-w-0 border-t border-gray-100 p-3 bg-white flex-shrink-0">
        {widgetUnavailable && (
          <p className="text-xs text-red-600 mb-2" data-testid="text-widget-unavailable">
            Chat is unavailable.
          </p>
        )}
        {attachError && (
          <p className="text-xs text-red-600 mb-2" data-testid="text-attach-error">
            {attachError}
          </p>
        )}
        {pendingFile && (
          <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-gray-600" data-testid="text-pending-image">
              {pendingFile.name}
            </span>
            <button
              type="button"
              className="flex-shrink-0 text-gray-400 hover:text-gray-700"
              data-testid="btn-remove-image"
              onClick={() => setPendingFile(null)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="flex min-w-0 gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            data-testid="input-chat-image"
            onChange={handleAttachChange}
          />
          <button
            type="button"
            data-testid="btn-attach-image"
            disabled={isSending || widgetUnavailable || isLoading}
            className="flex-shrink-0 w-9 h-9 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 disabled:opacity-40"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={widgetUnavailable ? "Chat unavailable" : "Type a message…"}
            disabled={isSending || widgetUnavailable || isLoading}
            data-testid="input-chat-message"
            className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
            style={{ "--tw-ring-color": accentColor } as React.CSSProperties}
          />
          <button
            onClick={() => sendMessage(inputText)}
            disabled={isSending || widgetUnavailable || isLoading || (!inputText.trim() && !pendingFile)}
            data-testid="btn-send-chat"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-opacity disabled:opacity-40"
            style={{ background: accentColor, color: accentTextColor }}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-center text-xs text-gray-300 mt-2">Powered by WhaChat</p>
      </div>
    </div>
  );
}

/** iframe embed route — parent `/widget.js` can pass `greeting` / `prefill` query params. */
export function WidgetFrame() {
  const noindex = <NoIndexHelmet />;
  const [match, params] = useRoute("/widget-frame/:widgetId");
  if (!match || !params?.widgetId) {
    return (
      <>
        {noindex}
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Widget not found</p>
      </div>
      </>
    );
  }
  return (
    <>
      {noindex}
      <WidgetFrameErrorBoundary>
        <WebchatWidget widgetId={params.widgetId} />
      </WidgetFrameErrorBoundary>
    </>
  );
}
