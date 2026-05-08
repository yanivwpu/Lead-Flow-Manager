import { useState, useEffect } from "react";
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
import {
  Loader2,
  MessageCircle,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Info,
  ChevronDown,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

const META_TEST_NUMBER_HELP =
  "You're connected to a Meta test number. Choose a production WhatsApp number before going live.";

interface MetaConfigResponse {
  embeddedSignupEnabled: boolean;
  coexistenceEnabled: boolean;
  coexistenceFeatureFlagSet?: boolean;
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
  phoneNumbers: Array<{
    id: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    phoneKind?: "production" | "test" | "unknown";
    phoneKindReasons?: string[];
  }>;
};

/** Prefer production lines when opening the pending picker (server sends phoneKind). */
function defaultWabaPhoneSelection(choices: WabaChoice[]): { wabaId: string; phoneId: string } | null {
  const flat: Array<{ wabaId: string; p: WabaChoice["phoneNumbers"][number] }> = [];
  for (const c of choices) {
    for (const p of c.phoneNumbers) {
      flat.push({ wabaId: c.wabaId, p });
    }
  }
  const prod = flat.find((x) => x.p.phoneKind === "production");
  if (prod) return { wabaId: prod.wabaId, phoneId: prod.p.id };
  const unk = flat.find((x) => x.p.phoneKind === "unknown");
  if (unk) return { wabaId: unk.wabaId, phoneId: unk.p.id };
  const first = flat[0];
  return first ? { wabaId: first.wabaId, phoneId: first.p.id } : null;
}

interface WhatsappStatusResponse {
  activeProvider: string;
  whatsappConnectedReason: "twilio" | "meta" | "none";
  /** Server: Meta rows exist but `whatsapp_provider` is still twilio */
  metaPersistedButTwilioSelected?: boolean;
  coexistenceEnabled?: boolean;
  coexistenceConfigId?: string | null;
  coexistenceFeatureFlagSet?: boolean;
  inboundRouting?: {
    summary: string;
    customerMessageDelivery: string;
    detail: string;
    coexistenceReconnectRecommended: boolean;
  };
  phoneGraphSnapshot?: Record<string, unknown> | null;
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
    connectedPhoneKind?: "production" | "test" | "unknown";
    connectedToMetaTestNumber?: boolean;
    metaTestNumberWarning?: string | null;
    /** App secret — verifies signed callbacks (separate from WABA subscribed_apps). */
    webhookSignatureHealth?: string;
    webhookHealth?: string;
    webhookUrl: string;
    webhookVerifyToken: string | null;
    connectionUsedCoexistenceFlow?: boolean;
  };
  twilio: {
    connected: boolean;
    whatsappNumber: string | null;
    providerLabel: string;
  };
  webhookCallbackUrl: string;
}

type CoexistenceDiagnosticsResponse = {
  connectionSavedAsCoexistence: boolean;
  activeProvider: string;
  meta: {
    connected: boolean;
    integrationStatus: string | null;
    webhookSubscribedFlag: boolean;
    connectionType: string | null;
    wabaId: string | null;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
  };
  graphPhone: {
    ok: boolean;
    httpStatus: number | null;
    fieldsRequested: string;
    data: Record<string, unknown> | null;
    error: { message?: string; code?: number } | null;
  };
  graphPhoneStatus: unknown;
  graphCodeVerificationStatus: unknown;
  wabaSubscribedApps: {
    httpOk: boolean;
    httpStatus: number;
    configuredAppIdPresent: boolean;
    appIds: string[];
    error: unknown;
  };
  phoneUnderWaba: boolean;
  wabaPhoneNumbers: {
    httpOk: boolean;
    httpStatus: number;
    phoneIds: string[];
    error: unknown;
  };
  inboundWebhookExpectedByGraph: "yes" | "no" | "unknown";
  reasons: string[];
};

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
  const { user: authedUser } = useAuth();
  const queryClient = useQueryClient();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [hubBanner, setHubBanner] = useState<HubBanner | null>(null);
  const [wabaPickerOpen, setWabaPickerOpen] = useState(false);
  const [wabaChoices, setWabaChoices] = useState<WabaChoice[] | null>(null);
  const [wabaPickerState, setWabaPickerState] = useState<string | null>(null);
  const [selectedWabaId, setSelectedWabaId] = useState<string | null>(null);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(null);

  // Redirect flow multi-WABA picker: Settings redirects back with ?state=<oauth_state>.
  // If present, fetch pending choices from the server and open the picker.
  const pendingStateFromUrl =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("state")
      : null;

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
      const res = await fetch("/api/integrations/whatsapp/repair-webhook-subscription", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Repair failed");
      if (!data.verified && data.error) throw new Error(data.error);
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
  const supportMode = authedUser?.role === "owner" || authedUser?.role === "admin";

  async function loadFacebookSdk(appId: string, version: string): Promise<void> {
    const w = window as any;
    if (w.FB && typeof w.FB.init === "function") {
      try {
        w.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
      } catch {
        // ignore re-init errors
      }
      return;
    }
    if (w.__fbSdkPromise) return w.__fbSdkPromise as Promise<void>;
    w.__fbSdkPromise = new Promise<void>((resolve, reject) => {
      w.fbAsyncInit = function () {
        try {
          w.FB.init({ appId, autoLogAppEvents: true, xfbml: true, version });
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      const existing = document.getElementById("facebook-jssdk");
      if (existing) return;
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true;
      s.defer = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      s.onerror = () => reject(new Error("Failed to load Facebook SDK"));
      document.body.appendChild(s);
    });
    return w.__fbSdkPromise as Promise<void>;
  }

  async function startEmbeddedSignupViaSdk(): Promise<void> {
    try {
      setHubBanner(null);
      const start = await fetch("/api/integrations/whatsapp/meta/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flow: "embedded" }),
      });
      const startJson = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(startJson?.error || "Could not start Meta signup");

      const session = startJson as {
        state: string;
        redirectUri: string;
        sdk: { appId: string; graphApiVersion: string; configId: string };
      };

      await loadFacebookSdk(session.sdk.appId, session.sdk.graphApiVersion);
      const w = window as any;

      await new Promise<void>((resolve, reject) => {
        const loginCb = async (response: any) => {
          try {
            const code = response?.authResponse?.code as string | undefined;
            if (!code) {
              reject(new Error(META_CANCELLED_MESSAGE));
              return;
            }
            const r = await fetch("/api/integrations/whatsapp/meta/complete-sdk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ code, state: session.state }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.error || "Could not complete Meta signup");
            if (j?.needsWabaPick && j?.state) {
              window.location.href = `/app/settings?section=channels&whatsapp_embedded=pick&state=${encodeURIComponent(j.state)}`;
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            resolve();
          } catch (e: any) {
            reject(e);
          }
        };

        try {
          w.FB.login(loginCb, {
            config_id: session.sdk.configId,
            response_type: "code",
            override_default_response_type: true,
            // Scopes are required for Graph access to WABA + phone assets.
            scope: "whatsapp_business_management,whatsapp_business_messaging,business_management",
            extras: {
              setup: {},
              feature: "whatsapp_embedded_signup",
              sessionInfoVersion: "2",
            },
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch (e: any) {
      // Fallback: redirect-based flow (kept for environments where SDK is blocked).
      console.warn("[WhatsApp Embedded Signup] SDK flow failed; falling back to redirect.", e?.message || e);
      window.location.href = "/api/integrations/whatsapp/meta/start-redirect?flow=embedded";
    }
  }

  const {
    data: coexistenceDiag,
    isFetching: diagFetching,
    refetch: refetchDiag,
  } = useQuery<CoexistenceDiagnosticsResponse>({
    queryKey: ["/api/integrations/whatsapp/coexistence-diagnostics"],
    enabled: !!metaActive,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const graphPhoneStatus = String(coexistenceDiag?.graphPhoneStatus ?? "").toUpperCase();
  const graphCodeStatus = String(coexistenceDiag?.graphCodeVerificationStatus ?? "").toUpperCase();
  const graphPhoneDisconnected =
    graphPhoneStatus === "DISCONNECTED" || graphCodeStatus === "NOT_VERIFIED";
  const graphSubscriptionConfirmed = coexistenceDiag?.wabaSubscribedApps?.configuredAppIdPresent === true;
  const setupIncomplete =
    metaActive &&
    (!meta?.phoneNumberId || graphPhoneDisconnected);

  // Load pending WABA choices (redirect flow) if present.
  const {
    data: pendingWabaPayload,
    isSuccess: pendingLoaded,
    isError: pendingError,
    error: pendingErr,
  } = useQuery({
    queryKey: ["/api/integrations/whatsapp/meta/pending-waba", pendingStateFromUrl],
    enabled: !!pendingStateFromUrl && pendingStateFromUrl.length > 0,
    queryFn: async () => {
      const res = await fetch(`/api/integrations/whatsapp/meta/pending-waba?state=${encodeURIComponent(pendingStateFromUrl!)}`, {
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load WhatsApp business choices");
      return data as { state: string; choices: WabaChoice[] };
    },
  });

  useEffect(() => {
    if (!pendingLoaded || !pendingWabaPayload?.choices?.length) return;
    setWabaChoices(pendingWabaPayload.choices);
    setWabaPickerState(pendingWabaPayload.state);
    const def = defaultWabaPhoneSelection(pendingWabaPayload.choices);
    setSelectedWabaId(def?.wabaId ?? pendingWabaPayload.choices[0]?.wabaId ?? null);
    setSelectedPhoneNumberId(def?.phoneId ?? pendingWabaPayload.choices[0]?.phoneNumbers?.[0]?.id ?? null);
    setWabaPickerOpen(true);
  }, [pendingLoaded, pendingWabaPayload]);

  useEffect(() => {
    if (!pendingError || !pendingErr) return;
    const msg = pendingErr instanceof Error ? pendingErr.message : "Could not load WhatsApp business choices.";
    setHubBanner({ variant: "error", message: msg });
  }, [pendingError, pendingErr]);

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
            <div className="min-w-0 text-sm flex-1">
              <p className="font-semibold text-emerald-900">
                {setupIncomplete ? "Connected — setup incomplete" : "Connected — Meta Cloud API"}
              </p>
              {meta?.connectedToMetaTestNumber && (
                <p className="text-xs text-amber-900 mt-2 border border-amber-200 rounded-md px-2 py-1.5 bg-amber-50/90">
                  {META_TEST_NUMBER_HELP}
                </p>
              )}
              {meta?.legacyManualConnection && (
                <p className="text-xs text-emerald-800 mt-1">
                  <span className="font-semibold">Legacy Meta connection</span> — credentials were entered manually. You can upgrade to Embedded Signup anytime: disconnect first, then use &quot;Continue with Meta&quot;.
                </p>
              )}
              {status?.inboundRouting?.coexistenceReconnectRecommended && !meta?.connectionUsedCoexistenceFlow && (
                <p className="text-xs text-amber-900 mt-2 border border-amber-200 rounded-md px-2 py-1.5 bg-amber-50/90">
                  <span className="font-semibold">Business App vs inbox:</span>{" "}
                  If customer messages open only in the WhatsApp Business app and never reach WhachatCRM, Meta is likely routing those chats to the phone only.
                  Add{" "}
                  <code className="text-[10px] bg-amber-100/80 px-1 rounded">META_WHATSAPP_COEXISTENCE_CONFIG_ID</code>{" "}
                  in Railway (coexistence Embedded Signup config from Meta), redeploy, disconnect Meta here, then reconnect using{" "}
                  <span className="font-medium">&quot;existing WhatsApp Business App number&quot;</span> so inbound webhooks receive conversations.
                </p>
              )}
              <dl className="mt-2 space-y-1.5 text-xs text-gray-700">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Display number</dt>
                  <dd className="font-medium truncate text-right">{meta?.displayPhoneNumber || "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500 shrink-0">Verified name</dt>
                  <dd className="font-medium truncate text-right">{meta?.verifiedName || "—"}</dd>
                </div>
              </dl>

              <div className="mt-3 pt-3 border-t border-emerald-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Webhook endpoint</dt>
                  <dd
                    className={cn(
                      "font-medium",
                      (meta?.webhookSignatureHealth ?? meta?.webhookHealth) === "ok"
                        ? "text-emerald-800"
                        : (meta?.webhookSignatureHealth ?? meta?.webhookHealth) === "needs_app_secret"
                          ? "text-red-700"
                          : "text-gray-600"
                    )}
                  >
                    {(meta?.webhookSignatureHealth ?? meta?.webhookHealth) === "ok"
                      ? "Healthy"
                      : (meta?.webhookSignatureHealth ?? meta?.webhookHealth) === "needs_app_secret"
                        ? "Error"
                        : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">WABA app subscription</dt>
                  <dd
                    className={cn(
                      "font-medium",
                      graphSubscriptionConfirmed
                        ? "text-emerald-800"
                        : "text-amber-800"
                    )}
                  >
                    {graphSubscriptionConfirmed ? "Confirmed (Graph)" : "Needs attention (Graph)"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Phone Cloud API status</dt>
                  <dd
                    className={cn(
                      "font-medium text-right",
                      graphPhoneDisconnected ? "text-amber-800" : "text-emerald-800"
                    )}
                    title={coexistenceDiag?.graphPhone?.fieldsRequested || undefined}
                  >
                    {coexistenceDiag?.graphPhone?.ok
                      ? `${graphPhoneStatus || "UNKNOWN"} / ${graphCodeStatus || "UNKNOWN"}`
                      : diagFetching
                        ? "Checking…"
                        : "Unknown"}
                  </dd>
                </div>
              </div>

              {setupIncomplete && (
                <p className="text-xs text-amber-900 mt-2 border border-amber-200 rounded-md px-2 py-1.5 bg-amber-50/90">
                  WhatsApp setup is incomplete. Finish phone verification in Meta.
                </p>
              )}

              {meta?.integrationStatus === "needs_attention" &&
                meta?.lastErrorMessage &&
                !String(meta.lastErrorMessage).toLowerCase().includes("webhook subscription could not be confirmed") && (
                  <p className="text-xs text-amber-800 mt-2 border border-amber-100 rounded-md px-2 py-1 bg-white/80">
                    {meta.lastErrorMessage}
                  </p>
                )}

              {supportMode && (
                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="mt-3">
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 py-1">
                    <ChevronDown
                      className={cn("h-4 w-4 transition-transform", advancedOpen && "rotate-180")}
                    />
                    Advanced details
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="mt-2 space-y-1 text-xs text-gray-700 border border-slate-200 rounded-lg p-2 bg-white/80">
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Provider</dt>
                        <dd className="font-medium">{meta?.providerLabel || "Meta Cloud API"}</dd>
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
                        <dt className="text-gray-500">Connection</dt>
                        <dd className="font-medium capitalize">{meta?.connectionType?.replace(/_/g, " ") || "—"}</dd>
                      </div>
                      {status?.inboundRouting && (
                        <div className="pt-1 mt-1 border-t border-slate-100 space-y-1">
                          <div className="flex justify-between gap-2">
                            <dt className="text-gray-500">Inbound routing (diag.)</dt>
                            <dd className="font-medium text-right text-[10px] max-w-[58%]">
                              {status.inboundRouting.customerMessageDelivery.replace(/_/g, " ")}
                            </dd>
                          </div>
                          <p className="text-[10px] text-gray-600 leading-snug">{status.inboundRouting.detail}</p>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className="text-gray-500">Callback URL</dt>
                        <dd className="font-mono text-[10px] truncate max-w-[55%] text-right" title={meta?.webhookUrl}>
                          {meta?.webhookUrl || "—"}
                        </dd>
                      </div>
                    </dl>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={diagFetching}
              onClick={() => refetchDiag()}
            >
              {diagFetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh Graph diagnostics
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={subscribeMutation.isPending}
              onClick={async () => {
                await subscribeMutation.mutateAsync();
                queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
                await refetchDiag();
              }}
              title="POST /{waba-id}/subscribed_apps — re-subscribe this Meta app to your WABA"
            >
              {subscribeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Repair WABA subscription
            </Button>
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
              {cfg?.coexistenceEnabled && (
                <p className="text-[11px] text-blue-800 mt-2 rounded-md border border-blue-100 bg-blue-50/80 px-2 py-1.5">
                  Already chatting with customers in the <span className="font-medium">WhatsApp Business</span> app? Use{" "}
                  <span className="font-semibold">option B</span> so Meta can route messages to WhachatCRM and your phone together (coexistence).
                </p>
              )}
            </div>
            <div className="p-3 space-y-3">
              <button
                type="button"
                disabled={!cfg?.embeddedSignupEnabled}
                onClick={() => void startEmbeddedSignupViaSdk()}
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
                    <p className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                      Using Embedded Signup JS SDK
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
                disabled={true}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  "border-gray-100 opacity-60 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">B) Use existing WhatsApp Business App number</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Coming soon — Coexistence Embedded Signup (keep the same number on phone + Cloud API).
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">
                  Not available yet. Use option A to provision Cloud API.
                </p>
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
            <AlertDialogTitle>Select WhatsApp number</AlertDialogTitle>
            <AlertDialogDescription>
              Pick the production WhatsApp Business line for this workspace. Test/sample lines are labeled —
              avoid them for live customers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm max-h-[min(60vh,420px)] overflow-y-auto pr-1">
            {(wabaChoices ?? []).map((c) => (
              <div
                key={c.wabaId}
                className="rounded-md border border-slate-200 overflow-hidden bg-white"
              >
                <div className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 border-b border-slate-100">
                  {c.wabaName || `WABA ${c.wabaId}`}
                </div>
                <div className="divide-y divide-slate-100">
                  {c.phoneNumbers.map((p) => {
                    const selected =
                      selectedWabaId === c.wabaId && selectedPhoneNumberId === p.id;
                    const kind = p.phoneKind ?? "unknown";
                    const badge =
                      kind === "test" ? "Test" : kind === "production" ? "Production" : "Unknown";
                    const badgeClass =
                      kind === "test"
                        ? "bg-amber-100 text-amber-900 border-amber-200"
                        : kind === "production"
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-slate-100 text-slate-700 border-slate-200";
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50/80",
                          selected && "bg-emerald-50"
                        )}
                        onClick={() => {
                          setSelectedWabaId(c.wabaId);
                          setSelectedPhoneNumberId(p.id);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 font-medium truncate">
                            {p.displayPhoneNumber || p.verifiedName || p.id}
                          </div>
                          {p.verifiedName ? (
                            <div className="text-[11px] text-slate-500 truncate">{p.verifiedName}</div>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-medium",
                            badgeClass
                          )}
                        >
                          {badge}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
