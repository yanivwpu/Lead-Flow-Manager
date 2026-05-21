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
import {
  META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE,
  buildEmbeddedSignupPreLoginDiagnostics,
  inferMetaLoginFailureMessage,
  isMetaEmbeddedSignupBlockedError,
  postWhatsappEmbeddedSignupDiagnostics,
  redactFbLoginResponse,
} from "@/lib/whatsappEmbeddedSignupDiagnostics";

const META_TEST_NUMBER_HELP = "Connected to Meta test number. Ready for testing.";

interface MetaConfigResponse {
  appIdSource?: "META_APP_ID";
  appIdMatchesInstagramAppId?: boolean;
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

const WCS_WHATSAPP_FB_SDK = "__wcsWhatsappFbSdkState";

type WhatsappFbSdkState = {
  promise?: Promise<void>;
  appId?: string;
  version?: string;
};

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
      if (!res.ok) throw new Error(data.error || "We couldn't refresh the connection. Please try again.");
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
        throw new Error(data.error || "We couldn't disconnect WhatsApp. Please try again.");
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

  function getWhatsappFbSdkState(w: Window & typeof globalThis & Record<string, unknown>): WhatsappFbSdkState {
    if (!w[WCS_WHATSAPP_FB_SDK]) w[WCS_WHATSAPP_FB_SDK] = {};
    return w[WCS_WHATSAPP_FB_SDK] as WhatsappFbSdkState;
  }

  async function loadFacebookSdk(appId: string, version: string): Promise<void> {
    const w = window as Window & typeof globalThis & Record<string, unknown>;
    const state = getWhatsappFbSdkState(w);

    const initSdk = () => {
      const FB = w.FB as { init: (opts: Record<string, unknown>) => void } | undefined;
      if (!FB?.init) throw new Error("Facebook SDK loaded but FB.init is missing");
      FB.init({ appId, cookie: true, autoLogAppEvents: true, xfbml: true, version });
      state.appId = appId;
      state.version = version;
    };

    if (w.FB && state.appId && state.appId !== appId) {
      console.warn("[WhatsApp Embedded Signup] Re-initializing Facebook SDK (appId changed)", {
        priorAppIdTail: state.appId.slice(-6),
        nextAppIdTail: appId.slice(-6),
      });
      delete w.FB;
      delete w.fbAsyncInit;
      const stale = document.getElementById("facebook-jssdk");
      if (stale) stale.remove();
      state.promise = undefined;
    }

    if (w.FB && state.appId === appId && state.version === version) {
      try {
        initSdk();
      } catch {
        /* ignore re-init */
      }
      return;
    }

    if (!state.promise) {
      state.promise = new Promise<void>((resolve, reject) => {
        w.fbAsyncInit = function () {
          try {
            initSdk();
            resolve();
          } catch (e) {
            reject(e);
          }
        };
        const existing = document.getElementById("facebook-jssdk");
        if (!existing) {
          const s = document.createElement("script");
          s.id = "facebook-jssdk";
          s.async = true;
          s.defer = true;
          s.crossOrigin = "anonymous";
          s.src = "https://connect.facebook.net/en_US/sdk.js";
          s.onerror = () => reject(new Error("Failed to load Facebook SDK"));
          document.body.appendChild(s);
        } else if (w.FB) {
          try {
            w.fbAsyncInit?.();
          } catch (e) {
            reject(e);
          }
        }
      });
    }

    await state.promise;
    if (!w.FB) throw new Error("Facebook SDK did not initialize");
  }

  async function startEmbeddedSignupViaSdk(): Promise<void> {
    const priorSdkAppId =
      (window as Window & typeof globalThis & Record<string, unknown>)[WCS_WHATSAPP_FB_SDK] as
        | WhatsappFbSdkState
        | undefined;
    let session: {
      state: string;
      redirectUri: string;
      sdk: { appId: string; graphApiVersion: string; configId: string };
    } | null = null;

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

      session = startJson as typeof session;
      const { appId, graphApiVersion, configId } = session!.sdk;
      const appIdMissing = !appId?.trim();
      const configIdMissing = !configId?.trim();

      await loadFacebookSdk(appId, graphApiVersion);
      const w = window as Window & typeof globalThis & Record<string, unknown>;
      const sdkLoaded = !!(w.FB && typeof (w.FB as { login?: unknown }).login === "function");

      const preLoginDiag = buildEmbeddedSignupPreLoginDiagnostics({
        phase: "pre_fb_login",
        loginMethod: "embedded_signup",
        appId,
        configId,
        graphVersion: graphApiVersion,
        userId: authedUser?.id ?? null,
        userEmail: authedUser?.email ?? null,
        sdkLoaded,
        sdkPriorAppId: priorSdkAppId?.appId ?? null,
        cfgAppId: cfg?.appId ?? null,
        cfgEmbeddedConfigId: cfg?.embeddedSignupConfigId ?? null,
        appIdMissing,
        configIdMissing,
        appIdMatchesInstagramAppId: cfg?.appIdMatchesInstagramAppId,
        embeddedSignupEnabled: cfg?.embeddedSignupEnabled,
      });
      console.log("[WhatsApp Embedded Signup] pre_fb_login", preLoginDiag);
      void postWhatsappEmbeddedSignupDiagnostics(preLoginDiag);

      if (appIdMissing || configIdMissing) {
        throw new Error(
          "WhatsApp signup is not configured on the server (missing Meta app id or Embedded Signup config). Please contact support.",
        );
      }

      if (cfg?.appIdMatchesInstagramAppId) {
        console.error(
          "[WhatsApp Embedded Signup] Server reports META_APP_ID matches INSTAGRAM_APP_ID — misconfiguration",
        );
      }

      await new Promise<void>((resolve, reject) => {
        const loginCb = async (response: unknown) => {
          try {
            const code = (response as { authResponse?: { code?: string } })?.authResponse?.code;
            if (!code) {
              const metaMsg = inferMetaLoginFailureMessage(response);
              const loginDiag = {
                ...preLoginDiag,
                phase: "fb_login_callback_no_code",
                fbResponse: redactFbLoginResponse(response),
                metaMessage: metaMsg,
              };
              console.warn("[WhatsApp Embedded Signup] fb_login_no_code", loginDiag);
              void postWhatsappEmbeddedSignupDiagnostics(loginDiag);

              if (metaMsg && isMetaEmbeddedSignupBlockedError(metaMsg)) {
                reject(new Error(META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE));
                return;
              }
              reject(new Error(META_CANCELLED_MESSAGE));
              return;
            }

            const r = await fetch("/api/integrations/whatsapp/meta/complete-sdk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ code, state: session!.state }),
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
          } catch (e: unknown) {
            reject(e);
          }
        };

        try {
          (w.FB as { login: (cb: (r: unknown) => void, opts: Record<string, unknown>) => void }).login(
            loginCb,
            {
              config_id: configId,
              response_type: "code",
              override_default_response_type: true,
              scope: "whatsapp_business_management,whatsapp_business_messaging,business_management",
              extras: {
                setup: {},
                feature: "whatsapp_embedded_signup",
                sessionInfoVersion: "2",
              },
            },
          );
        } catch (e) {
          reject(e);
        }
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const blocked = isMetaEmbeddedSignupBlockedError(msg) || msg === META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE;
      void postWhatsappEmbeddedSignupDiagnostics({
        phase: "embedded_signup_failed",
        loginMethod: "embedded_signup",
        error: msg,
        blocked,
        userId: authedUser?.id ?? null,
        userEmail: authedUser?.email ?? null,
        url: typeof window !== "undefined" ? window.location.href : null,
        sdkAppId: session?.sdk?.appId ?? null,
        sdkConfigId: session?.sdk?.configId ?? null,
      });

      if (blocked) {
        setHubBanner({ variant: "error", message: META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE });
        return;
      }

      if (msg === META_CANCELLED_MESSAGE) {
        setHubBanner({ variant: "neutral", message: META_CANCELLED_MESSAGE });
        return;
      }

      setHubBanner({ variant: "error", message: msg || "Could not start Meta signup" });
      console.warn("[WhatsApp Embedded Signup] SDK flow failed; falling back to redirect.", msg);
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
  /** `NOT_VERIFIED` alone is common on test numbers and does not prove Cloud API is off. */
  const graphPhoneDisconnected = graphPhoneStatus === "DISCONNECTED";
  const graphSubscriptionConfirmed = coexistenceDiag?.wabaSubscribedApps?.configuredAppIdPresent === true;
  const setupIncomplete =
    metaActive &&
    !meta?.connectedToMetaTestNumber &&
    (!meta?.phoneNumberId || graphPhoneDisconnected);
  const incompleteMessage =
    "WhatsApp setup is not finished yet. Please complete your phone verification in Meta.";

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
          Meta WhatsApp signup isn&apos;t available in this workspace yet. Please contact support to finish setup.
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
              <p className="font-semibold text-emerald-900">Connected</p>
              {meta?.connectedToMetaTestNumber && (
                <p className="text-xs text-amber-900 mt-2 border border-amber-200 rounded-md px-2 py-1.5 bg-amber-50/90">
                  {META_TEST_NUMBER_HELP}
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

              {supportMode && (
                <div className="mt-3 pt-3 border-t border-emerald-200/80 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                  <dt className="text-gray-600">Connection health</dt>
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
                          ? "Needs setup"
                          : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-gray-600">Meta app access</dt>
                    <dd
                      className={cn(
                        "font-medium",
                        graphSubscriptionConfirmed
                          ? "text-emerald-800"
                          : "text-amber-800"
                      )}
                    >
                      {graphSubscriptionConfirmed ? "Confirmed" : "Needs attention"}
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
              )}

              {setupIncomplete && (
                <p className="text-xs text-amber-900 mt-2 border border-amber-200 rounded-md px-2 py-1.5 bg-amber-50/90">
                  {incompleteMessage}
                </p>
              )}

              {supportMode &&
                meta?.integrationStatus === "needs_attention" &&
                meta?.lastErrorMessage &&
                !String(meta.lastErrorMessage).toLowerCase().includes("webhook subscription could not be confirmed") && (
                  <p className="text-xs text-amber-800 mt-2 border border-amber-100 rounded-md px-2 py-1 bg-white/80">
                    WhatsApp needs attention. Open Manage to review the setup.
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
                        <dd className="font-medium">{meta?.providerLabel || "Meta"}</dd>
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
            {supportMode && (
              <>
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
                  Refresh connection check
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
                  title="Refresh the Meta app connection for this WhatsApp account"
                >
                  {subscribeMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-1" />
                  )}
                  Refresh Meta connection
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
              Disconnect
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
                Connect WhatsApp through Meta Embedded Signup. WhachatCRM will verify the connection automatically.
              </p>
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
                    <p className="text-sm font-semibold text-gray-900">Continue with Meta Embedded Signup</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Choose your business account, WhatsApp account, and phone number in Meta.
                    </p>
                  </div>
                </div>
                {!cfg?.embeddedSignupEnabled && (
                  <p className="text-[10px] text-amber-700 mt-2">
                    WhatsApp setup isn&apos;t available yet. Please contact support.
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
                    <p className="text-sm font-semibold text-gray-900">Use an existing WhatsApp Business App number</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Coming soon
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-gray-500 mt-2">Planned support for businesses that want shared app and inbox access.</p>
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
                    <p className="text-sm font-semibold text-gray-900">Legacy Twilio connection</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Available for existing Twilio-based setups.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-2">
            <p className="text-[11px] text-gray-600">
              Advanced setup for existing Meta credentials{" "}
              <button
                type="button"
                className="text-emerald-700 font-medium hover:underline inline-flex items-center gap-0.5"
                onClick={() => {
                  onClose();
                  onOpenManualMeta();
                }}
              >
                Open manual setup <ExternalLink className="h-3 w-3" />
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
              Pick the WhatsApp number you want to connect to this workspace. Test lines are labeled — avoid them for live customers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 text-sm max-h-[min(60vh,420px)] overflow-y-auto pr-1">
            {(wabaChoices ?? []).map((c) => (
              <div
                key={c.wabaId}
                className="rounded-md border border-slate-200 overflow-hidden bg-white"
              >
                <div className="bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 border-b border-slate-100">
                  {c.wabaName || "Business account"}
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
