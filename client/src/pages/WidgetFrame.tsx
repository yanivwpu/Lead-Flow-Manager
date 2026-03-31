import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { Loader2, Send, ChevronDown } from "lucide-react";

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
  templateVariables?: {
    chatbotButtons?: ButtonOption[];
  } | null;
}

const POLL_INTERVAL = 2500; // ms

export function WidgetFrame() {
  const [match, params] = useRoute("/widget-frame/:widgetId");
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [widgetColor, setWidgetColor] = useState("#25D366");
  const [widgetName, setWidgetName] = useState("Chat with us");
  const [clickedButtons, setClickedButtons] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const userId = params?.widgetId;

  // Init: get/create visitorId from localStorage
  useEffect(() => {
    if (!userId) return;
    const storageKey = `wchat_visitor_${userId}`;
    let vid = localStorage.getItem(storageKey);
    if (!vid) {
      vid = `visitor_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      localStorage.setItem(storageKey, vid);
    }
    setVisitorId(vid);

    // Fetch widget settings (public endpoint)
    fetch(`/api/webchat/${userId}/settings`)
      .then(r => r.json())
      .then(data => {
        if (data?.color) setWidgetColor(data.color);
        if (data?.businessName) setWidgetName(`Chat with ${data.businessName}`);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [userId]);

  const fetchMessages = useCallback(async () => {
    if (!userId || !visitorId) return;
    try {
      const res = await fetch(`/api/webchat/${userId}/${visitorId}/messages`);
      if (!res.ok) return;
      const data: ChatMessage[] = await res.json();
      setMessages(data);
    } catch {
      // silently ignore poll errors
    }
  }, [userId, visitorId]);

  // Start polling once we have visitorId
  useEffect(() => {
    if (!visitorId) return;
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, POLL_INTERVAL);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [visitorId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !userId || !visitorId || isSending) return;
    setIsSending(true);
    const optimisticMsg: ChatMessage = {
      id: `opt_${Date.now()}`,
      direction: "inbound",
      content: text,
      contentType: "text",
      mediaUrl: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setInputText("");

    try {
      await fetch(`/api/webchat/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          message: text,
          name: "Website Visitor",
        }),
      });
      // Re-fetch to get server-confirmed messages + any bot replies
      await new Promise(r => setTimeout(r, 800));
      await fetchMessages();
    } catch (e) {
      console.error("Send error", e);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  }, [userId, visitorId, isSending, fetchMessages]);

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText);
    }
  };

  if (!match || !userId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Widget not found</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: widgetColor }} />
      </div>
    );
  }

  const deduped = Array.from(
    new Map(messages.map(m => [m.id.startsWith("opt_") ? m.id : m.id, m])).values()
  );

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 text-white flex-shrink-0 shadow-sm" style={{ background: widgetColor }}>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
          {widgetName.charAt(0)}
        </div>
        <div>
          <h1 className="font-semibold text-sm leading-none">{widgetName}</h1>
          <p className="text-xs opacity-80 mt-0.5">We're here to help</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-3 space-y-2">
        {/* Welcome bubble */}
        {deduped.length === 0 && (
          <div className="flex justify-start">
            <div className="max-w-[75%] bg-white text-gray-800 rounded-2xl rounded-bl-none px-3 py-2 text-sm shadow-sm border border-gray-100">
              Hi! How can we help you today? 👋
            </div>
          </div>
        )}

        {deduped.map((msg) => {
          const isOutbound = msg.direction === "outbound";
          const buttons: ButtonOption[] = msg.templateVariables?.chatbotButtons ?? [];
          const isButtonMessage = msg.contentType === "buttons" && buttons.length > 0;
          const messageResponded = clickedButtons.has(msg.id);

          return (
            <div
              key={msg.id}
              className={`flex ${isOutbound ? "justify-start" : "justify-end"}`}
              data-testid={`msg-${msg.id}`}
            >
              <div className={`max-w-[80%] ${isOutbound ? "" : ""}`}>
                {/* Message bubble */}
                {(msg.content || msg.contentType === "buttons") && (
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${
                      isOutbound
                        ? "bg-white text-gray-800 rounded-bl-none border border-gray-100"
                        : "text-white rounded-br-none"
                    }`}
                    style={!isOutbound ? { background: widgetColor } : {}}
                  >
                    {msg.contentType === "image" && msg.mediaUrl ? (
                      <img src={msg.mediaUrl} alt="image" className="max-w-full rounded-lg max-h-48 object-cover" />
                    ) : msg.contentType === "video" && msg.mediaUrl ? (
                      <video src={msg.mediaUrl} controls className="max-w-full rounded-lg max-h-48" />
                    ) : (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                  </div>
                )}

                {/* Interactive buttons rendered below outbound bot messages */}
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
                              : "bg-white border-gray-200 hover:border-opacity-80 hover:text-white"
                          }`}
                          style={
                            !isClicked
                              ? {
                                  color: widgetColor,
                                  borderColor: widgetColor,
                                  borderWidth: "1.5px",
                                }
                              : {}
                          }
                          onMouseEnter={e => {
                            if (!isClicked) {
                              (e.target as HTMLButtonElement).style.background = widgetColor;
                              (e.target as HTMLButtonElement).style.color = "white";
                            }
                          }}
                          onMouseLeave={e => {
                            if (!isClicked) {
                              (e.target as HTMLButtonElement).style.background = "white";
                              (e.target as HTMLButtonElement).style.color = widgetColor;
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
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3 bg-white flex-shrink-0">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            disabled={isSending}
            data-testid="input-chat-message"
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
            style={{ "--tw-ring-color": widgetColor } as React.CSSProperties}
          />
          <button
            onClick={() => sendMessage(inputText)}
            disabled={isSending || !inputText.trim()}
            data-testid="btn-send-chat"
            className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-white transition-opacity disabled:opacity-40"
            style={{ background: widgetColor }}
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
