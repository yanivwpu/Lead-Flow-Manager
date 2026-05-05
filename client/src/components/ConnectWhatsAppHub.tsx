import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, MessageCircle, Smartphone, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetaConfigResponse {
  embeddedSignupEnabled: boolean;
  coexistenceEnabled: boolean;
  metaConfigured: boolean;
  appId: string | null;
  graphApiVersion: string;
  redirectUri: string;
  embeddedSignupConfigId: string | null;
  coexistenceConfigId: string | null;
  missingEnvHints: string[];
}

type WabaChoice = {
  wabaId: string;
  wabaName?: string;
  phoneNumbers: Array<{ id: string; displayPhoneNumber?: string; verifiedName?: string }>;
};

interface WhatsappStatusResponse {
  activeProvider: string;
  meta: {
    connected: boolean;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    providerLabel: string;
    connectionType: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    integrationStatus: string;
    webhookSubscribed: boolean;
    webhookLastCheckedAt: string | null;
    lastErrorMessage: string | null;
    legacyManualConnection?: boolean;
    webhookHealth?: string;
    webhookUrl: string;
    webhookVerifyToken: string | null;
  };
  twilio: {
    connected: boolean;
    whatsappNumber: string | null;
    providerLabel: string;
  };
  webhookCallbackUrl: string;
}

interface ConnectWhatsAppHubProps {
  onOpenTwilio: () => void;
  onOpenManualMeta: () => void;
  onClose: () => void;
}

const META_CANCELLED_MESSAGE =
  "Meta setup was cancelled. You can try again anytime.";

type HubBanner = { variant: "error"; message: string } | { variant: "neutral"; message: string };

export function ConnectWhatsAppHub({
  onOpenTwilio,
  onOpenManualMeta,
  onClose,
}: ConnectWhatsAppHubProps) {
  const queryClient = useQueryClient();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [hubBanner, setHubBanner] = useState<HubBanner | null>(null);
  const [wabaPickerOpen, setWabaPickerOpen] = useState(false);
  const [wabaChoices, setWabaChoices] = useState<WabaChoice[] | null>(null);
  const [wabaPickerState, setWabaPickerState] = useState<string | null>(null);
  const [selectedWabaId, setSelectedWabaId] = useState<string | null>(null);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(null);

  const { data: cfg, isLoading: cfgLoading } = useQuery<MetaConfigResponse>({
    queryKey: ["/api/integrations/whatsapp/meta/config"],
    staleTime: 60_000,
  });

  const { data: status, isLoading: statusLoading } = useQuery<WhatsappStatusResponse>({
    queryKey: ["/api/integrations/whatsapp/status"],
    staleTime: 15_000,
  });

  const subscribeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/whatsapp/meta/subscribe-webhooks", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not subscribe webhooks");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setHubBanner(null);
    },
    onError: (e: Error) => setHubBanner({ variant: "error", message: e.message }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/whatsapp/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: "meta" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Disconnect failed");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      setConfirmDisconnect(false);
      setHubBanner(null);
    },
    onError: (e: Error) => setHubBanner({ variant: "error", message: e.message }),
  });

  const loading = cfgLoading || statusLoading;
  const meta = status?.meta;
  const metaActive = status?.activeProvider === "meta" && meta?.connected;

  return (
    <div className="space-y-4 mt-2">
      {hubBanner && (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm flex gap-2 items-start",
            hubBanner.variant === "error"
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-slate-200 bg-slate-50 text-slate-700"
          )}
        >
          {hubBanner.variant === "error" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-700" aria-hidden />
          ) : (
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-slate-500" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            {hubBanner.variant === "error" ? (
              <>
                <p className="font-medium">Couldn&apos;t complete setup</p>
                <p className="text-xs mt-0.5">{hubBanner.message}</p>
              </>
            ) : (
              <p className="text-sm">{hubBanner.message}</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("mt-2", hubBanner.variant === "neutral" && "border-slate-300")}
              onClick={() => setHubBanner(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {!cfg?.metaConfigured && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          Meta WhatsApp signup isn&apos;t configured on this server yet. Ask your admin to set Meta app environment variables, or use Twilio below.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      ) : metaActive ? (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-emerald-900">Connected — Meta Cloud API</p>
              {meta?.legacyManualConnection && (
                <p className="text-xs text-emerald-800 mt-1">
                  <span className="font-semibold">Legacy Meta connection</span> — credentials were entered manually. You can upgrade to Embedded Signup anytime: disconnect first, then use &quot;Continue with Meta&quot;.
                </p>
              )}
              <dl className="mt-2 space-y-1 text-xs text-gray-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Display number</dt>
                  <dd className="font-medium truncate">{meta?.displayPhoneNumber || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Verified name</dt>
                  <dd className="font-medium truncate">{meta?.verifiedName || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">WABA ID</dt>
                  <dd className="font-mono text-[11px] truncate">{meta?.businessAccountId || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Phone number ID</dt>
                  <dd className="font-mono text-[11px] truncate">{meta?.phoneNumberId || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Webhook subscription</dt>
                  <dd className="font-medium">
                    {meta?.webhookSubscribed ? "Subscribed" : "Needs attention"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Connection</dt>
                  <dd className="font-medium capitalize">{meta?.connectionType?.replace(/_/g, " ") || "—"}</dd>
                </div>
              </dl>
              {meta?.integrationStatus === "needs_attention" && meta?.lastErrorMessage && (
                <p className="text-xs text-amber-800 mt-2 border border-amber-100 rounded-md px-2 py-1 bg-white/80">
                  {meta.lastErrorMessage}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {!meta?.webhookSubscribed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={subscribeMutation.isPending}
                onClick={() => subscribeMutation.mutate()}
              >
                {subscribeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Retry webhook subscription
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
              Disconnect Meta
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b bg-gray-50/80">
              <h3 className="text-sm font-semibold text-gray-900">Connect WhatsApp</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Choose how you want to connect. Twilio stays available as an alternate provider.
              </p>
            </div>
            <div className="p-3 space-y-3">
              <button
                type="button"
                disabled={!cfg?.embeddedSignupEnabled}
                onClick={() => {
                  console.log("[WHATSAPP CONNECT] full redirect start");
                  window.location.href = "/api/integrations/whatsapp/meta/start-redirect?flow=embedded";
                }}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  cfg?.embeddedSignupEnabled
                    ? "border-emerald-200 hover:bg-emerald-50/50"
                    : "border-gray-100 opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">A) Continue with Meta</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Embedded Signup — create or select Business, WABA, and phone in Meta&apos;s flow (recommended).
                    </p>
                  </div>
                </div>
                {!cfg?.embeddedSignupEnabled && (
                  <p className="text-[10px] text-amber-700 mt-2">
                    Meta setup is not enabled yet (missing env or config ID). Your admin should configure Embedded Signup.
                  </p>
                )}
              </button>

              <button
                type="button"
                disabled={!cfg?.coexistenceEnabled}
                onClick={() => {
                  console.log("[WHATSAPP CONNECT] full redirect start");
                  window.location.href = "/api/integrations/whatsapp/meta/start-redirect?flow=coexistence";
                }}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  cfg?.coexistenceEnabled
                    ? "border-blue-200 hover:bg-blue-50/40"
                    : "border-gray-100 opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">B) Use existing WhatsApp Business App number</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Coexistence path where Meta supports it — keep the Business app and add Cloud API.
                    </p>
                  </div>
                </div>
                {!cfg?.coexistenceEnabled && (
                  <p className="text-[10px] text-gray-500 mt-2">
                    Not available until <code className="text-[10px] bg-gray-100 px-1 rounded">META_WHATSAPP_COEXISTENCE_CONFIG_ID</code> is set in your server env (separate from the main Embedded Signup config). If Meta says your number isn&apos;t eligible, use option A or Twilio.
                  </p>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenTwilio();
                }}
                className="w-full text-left rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">C) Connect with Twilio instead</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Use your existing Twilio WhatsApp sender — SMS optional via same account.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2">
            <p className="text-[11px] text-gray-600">
              Advanced: already have a permanent token and IDs?{" "}
              <button
                type="button"
                className="text-emerald-700 font-medium hover:underline inline-flex items-center gap-0.5"
                onClick={() => {
                  onClose();
                  onOpenManualMeta();
                }}
              >
                Paste credentials manually <ExternalLink className="h-3 w-3" />
              </button>
            </p>
          </div>

          {/* Full redirect flow leaves this page immediately. */}
        </>
      )}

      <AlertDialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Meta WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Inbound WhatsApp messages will stop routing here until you reconnect. Conversations and contacts are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={wabaPickerOpen}
        onOpenChange={(open) => {
          // keep state if closing via escape; user can restart if needed
          setWabaPickerOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Select WhatsApp Business Account</AlertDialogTitle>
            <AlertDialogDescription>
              Multiple WhatsApp Business Accounts with phone numbers were found. Choose which one to connect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm">
            {(wabaChoices ?? []).map((c) => {
              const isSelected = selectedWabaId === c.wabaId;
              return (
                <button
                  key={c.wabaId}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-md border px-3 py-2",
                    isSelected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:bg-slate-50"
                  )}
                  onClick={() => {
                    setSelectedWabaId(c.wabaId);
                    setSelectedPhoneNumberId(c.phoneNumbers?.[0]?.id ?? null);
                  }}
                >
                  <div className="font-medium text-slate-900">{c.wabaName || `WABA ${c.wabaId}`}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {c.phoneNumbers
                      .map((p) => p.displayPhoneNumber || p.verifiedName || p.id)
                      .slice(0, 3)
                      .join(" • ")}
                  </div>
                </button>
              );
            })}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setWabaPickerOpen(false);
                setHubBanner({ variant: "neutral", message: "Selection cancelled. You can try connecting again anytime." });
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!wabaPickerState || !selectedWabaId || !selectedPhoneNumberId}
              onClick={() => {
                void (async () => {
                  try {
                    const res = await fetch("/api/integrations/whatsapp/meta/choose-waba", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({
                        state: wabaPickerState,
                        wabaId: selectedWabaId,
                        phoneNumberId: selectedPhoneNumberId,
                      }),
                    });
                    const j = (await res.json()) as { success?: boolean; error?: string };
                    if (!res.ok || !j.success) {
                      setHubBanner({ variant: "error", message: j.error || "Could not finalize selection." });
                      return;
                    }
                    setWabaPickerOpen(false);
                    setHubBanner(null);
                    await queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
                    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  } catch (e: any) {
                    setHubBanner({ variant: "error", message: e?.message || "Could not finalize selection." });
                  }
                })();
              }}
            >
              Connect selected account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
