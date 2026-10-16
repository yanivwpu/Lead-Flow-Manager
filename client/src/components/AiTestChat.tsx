import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ShoppingActivityView } from "@/components/inbox/ShoppingActivity";
import type { TestChatView } from "@shared/aiTestChat";
type Diagnostics = {
  aiMode: string;
  shoppingEnabled: boolean;
  catalogConnected: boolean;
  catalogStatus: string;
  inventoryStatus: string;
  retryAt: number | null;
};
export function AiTestChat() {
  const { user, sessionAligned } = useAuth();
  if (!user || !sessionAligned) return null;
  return <Console key={user.id} />;
}
function Console() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false),
    [chat, setChat] = useState<TestChatView>(),
    [diagnostics, setDiagnostics] = useState<Diagnostics>();
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const pending = useRef<{ eventId: string; text: string } | undefined>(
    undefined,
  );
  const mounted = useRef(true),
    transcriptEnd = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: "nearest" });
  }, [chat, busy]);
  async function diagnose(id: string) {
    try {
      const r = await apiRequest("GET", `/api/ai/test-chat/${id}/diagnostics`);
      const data = await r.json();
      if (mounted.current) setDiagnostics(data);
    } catch {
      if (mounted.current) setDiagnostics(undefined);
    }
  }
  async function start() {
    setBusy(true);
    setError(false);
    try {
      const r = await apiRequest("POST", "/api/ai/test-chat", {});
      const data = await r.json();
      if (mounted.current) {
        setChat(data);
        await diagnose(data.id);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (open && !chat) void start();
  }, [open]);
  async function send() {
    if (!chat || !text.trim() || busy) return;
    const turn =
      pending.current?.text === text.trim()
        ? pending.current
        : { eventId: crypto.randomUUID(), text: text.trim() };
    pending.current = turn;
    setBusy(true);
    setError(false);
    try {
      const r = await apiRequest(
        "POST",
        `/api/ai/test-chat/${chat.id}/turn`,
        turn,
      );
      const data = await r.json();
      if (mounted.current) {
        setChat(data);
        setText("");
        pending.current = undefined;
        await diagnose(chat.id);
      }
    } catch (failure) {
      if (
        failure instanceof Error &&
        failure.message === "409: repeat_as_new_turn"
      )
        pending.current = undefined;
      if (mounted.current) {
        setError(true);
        await diagnose(chat.id);
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function reset() {
    if (!chat || busy) return;
    setBusy(true);
    setError(false);
    try {
      await apiRequest("DELETE", `/api/ai/test-chat/${chat.id}`);
      if (mounted.current) {
        setChat(undefined);
        setDiagnostics(undefined);
        setText("");
        pending.current = undefined;
        await start();
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t("testChat.title")}</Button>
      </DialogTrigger>
      <DialogContent
        dir={i18n.dir()}
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            {t("testChat.title")} · {t("testChat.mode")}
          </DialogTitle>
          <DialogDescription>{t("testChat.description")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          {t("testChat.channel")}: Web Chat · {t("testChat.aiMode")}:{" "}
          {diagnostics?.aiMode ?? "—"}
        </p>
        <p className="text-xs text-muted-foreground">{t("testChat.scope")}</p>
        {chat && <ShoppingActivityView state={chat.state} />}
        <div
          role="log"
          aria-label={t("testChat.transcript")}
          aria-live="polite"
          className="h-64 overflow-y-auto space-y-3 rounded border p-3"
        >
          {chat?.transcript.map((m) => (
            <div
              key={m.id}
              dir="auto"
              className={`whitespace-pre-wrap rounded p-2 ${m.role === "user" ? "bg-primary/10 ms-8" : "bg-muted me-8"}`}
            >
              <span className="block text-xs text-muted-foreground">
                {t(`testChat.${m.role}`)} ·{" "}
                {new Date(m.at).toLocaleTimeString()}
              </span>
              {m.content}
            </div>
          ))}
          {busy && <p role="status">{t("testChat.processing")}</p>}
          <div ref={transcriptEnd} />
        </div>
        {diagnostics && (
          <aside
            aria-label={t("testChat.diagnostics")}
            className="text-sm rounded bg-muted p-3 space-y-1"
          >
            <p>
              {t(
                diagnostics.catalogConnected
                  ? "testChat.connected"
                  : "testChat.disconnected",
              )}
            </p>
            <p>{t(`testChat.inventory.${diagnostics.inventoryStatus}`)}</p>
            {diagnostics.retryAt && diagnostics.retryAt > Date.now() && (
              <p>
                {t("testChat.retryAt")}:{" "}
                {new Date(diagnostics.retryAt).toLocaleTimeString()}
              </p>
            )}
            {!diagnostics.shoppingEnabled && <p>{t("testChat.shoppingOff")}</p>}
            <p>{t("shopping.checkoutDisabled")}</p>
          </aside>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex gap-2"
        >
          <input
            aria-label={t("testChat.message")}
            placeholder={t("testChat.message")}
            className="min-w-0 flex-1 rounded border p-2"
            value={text}
            maxLength={4000}
            disabled={busy || !chat}
            onChange={(e) => setText(e.target.value)}
          />
          <Button disabled={busy || !chat || !text.trim()} type="submit">
            {t("testChat.send")}
          </Button>
        </form>
        {error && <p role="alert">{t("testChat.error")}</p>}
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy || !chat}
            onClick={() => void reset()}
          >
            {t("testChat.reset")}
          </Button>
          {!chat && error && (
            <Button disabled={busy} onClick={() => void start()}>
              {t("testChat.retry")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
