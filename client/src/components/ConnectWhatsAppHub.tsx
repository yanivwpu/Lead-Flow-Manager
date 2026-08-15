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
import { trackWhatsappConnected } from "@/lib/ga4Events";
import {
  META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE,
  buildEmbeddedSignupPreLoginDiagnostics,
  inferMetaLoginFailureMessage,
  isMetaEmbeddedSignupBlockedError,
  postWhatsappEmbeddedSignupDiagnostics,
  redactFbLoginResponse,
} from "@/lib/whatsappEmbeddedSignupDiagnostics";
import {
  attachEmbeddedSignupSessionListener,
} from "@/lib/whatsappEmbeddedSignupSession";
import {
  createEmbeddedSignupCompletionCoordinator,
  shouldAutoRedirectAfterSdkFailure,
  type CompleteSdkResult,
} from "@/lib/whatsappEmbeddedSignupCompletion";
import { buildStandardEmbeddedSignupLoginOptions } from "@shared/whatsappEmbeddedSignupVersion";
import type { WhatsappEmbeddedSignupArchitecture } from "@shared/whatsappEmbeddedSignupVersion";
import { sanitizeWhatsappCustomerFacingError } from "@shared/whatsappEmbeddedSignupFailures";
import {
  WhatsAppConnectionHealthChecklist,
  type WhatsAppReadinessChecklist,
} from "@/components/WhatsAppConnectionHealthChecklist";
import { WhatsAppPhoneRegistrationPinForm } from "@/components/WhatsAppPhoneRegistrationPinForm";
import { useTranslation } from "react-i18next";

const SAFE_META_SETUP_ERROR =
  "Could not finish WhatsApp setup. Please try Connect WhatsApp again.";

function sanitizeWhatsappClientErrorMessage(message: string): string {
  return sanitizeWhatsappCustomerFacingError(message, SAFE_META_SETUP_ERROR);
}

const META_TEST_NUMBER_HELP =
  "Connected to Meta test number — ready for testing only.";

interface MetaConfigResponse {
  appIdSource?: "META_APP_ID";
  appIdMatchesInstagramAppId?: boolean;
  embeddedSignupEnabled: boolean;
  coexistenceEnabled: boolean;
  coexistenceFeatureFlagSet?: boolean;
  embeddedSignupV4FlagEnabled?: boolean;
  embeddedSignupV4ConfigConfigured?: boolean;
  embeddedSignupV4EnvReady?: boolean;
  metaConfigured: boolean;
  appId: string | null;
  graphApiVersion: string;
  redirectUri: string;
  embeddedSignupConfigId: string | null;
  embeddedSignupConfigIdLast4?: string | null;
  embeddedSignupV4ConfigId?: string | null;
  embeddedSignupV4ConfigIdLast4?: string | null;
  coexistenceConfigId: string | null;
  coexistenceConfigIdLast4?: string | null;
  /** Server-authoritative: this session may launch Coexistence (public kill-switch gate). */
  coexistenceLaunchAllowed?: boolean;
  missingEnvHints: string[];
}

const WCS_WHATSAPP_FB_SDK = "__wcsWhatsappFbSdkState";

type WhatsappFbSdkState = {
  promise?: Promise<void>;
  appId?: string;
  version?: string;
};

type EmbeddedSignupSession = {
  state: string;
  redirectUri: string;
  architecture?: WhatsappEmbeddedSignupArchitecture;
  sdk: {
    appId: string;
    graphApiVersion: string;
    configId: string;
    architecture?: WhatsappEmbeddedSignupArchitecture;
    loginOptions?: ReturnType<typeof buildStandardEmbeddedSignupLoginOptions>;
    configIdLast4?: string | null;
  };
};

type FacebookSdkWindow = Window & typeof globalThis & Record<string, unknown> & {
  fbAsyncInit?: () => void;
};

type WabaChoice = {
  wabaId: string;
  wabaName?: string;
  phoneNumbers: Array<{
    id: string;
    displayPhoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    platformType?: string;
    accountMode?: string;
    status?: string;
    codeVerificationStatus?: string;
    phoneKind?: "production" | "test" | "unknown";
    phoneKindReasons?: string[];
  }>;
};

/** Prefer production lines when opening the pending picker (server sends phoneKind). */
function flattenWabaPhones(choices: WabaChoice[]) {
  const flat: Array<{ wabaId: string; p: WabaChoice["phoneNumbers"][number] }> = [];
  for (const c of choices) {
    for (const p of c.phoneNumbers) {
      flat.push({ wabaId: c.wabaId, p });
    }
  }
  return flat;
}

function wabaChoicesHaveProduction(choices: WabaChoice[]): boolean {
  return flattenWabaPhones(choices).some((x) => x.p.phoneKind === "production");
}

function defaultWabaPhoneSelection(choices: WabaChoice[]): { wabaId: string; phoneId: string } | null {
  const flat = flattenWabaPhones(choices);
  const prod = flat.find((x) => x.p.phoneKind === "production");
  if (prod) return { wabaId: prod.wabaId, phoneId: prod.p.id };
  const unk = flat.find((x) => x.p.phoneKind === "unknown");
  if (unk) return { wabaId: unk.wabaId, phoneId: unk.p.id };
  const test = flat.find((x) => x.p.phoneKind === "test");
  if (test) return { wabaId: test.wabaId, phoneId: test.p.id };
  const first = flat[0];
  return first ? { wabaId: first.wabaId, phoneId: first.p.id } : null;
}

function findSelectedPhoneKind(
  choices: WabaChoice[] | null,
  wabaId: string | null,
  phoneId: string | null,
): "production" | "test" | "unknown" | null {
  if (!choices || !wabaId || !phoneId) return null;
  for (const c of choices) {
    if (c.wabaId !== wabaId) continue;
    const p = c.phoneNumbers.find((row) => row.id === phoneId);
    return (p?.phoneKind as "production" | "test" | "unknown" | undefined) ?? null;
  }
  return null;
}

interface WhatsappStatusResponse {
  activeProvider: string;
  whatsappConnectedReason: "twilio" | "meta" | "none";
  fullyReady?: boolean;
  setupIncomplete?: boolean;
  phoneRegistrationRequired?: boolean;
  readiness?: WhatsAppReadinessChecklist;
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
    fullyReady?: boolean;
    phoneNumberId: string | null;
    businessAccountId: string | null;
    providerLabel: string;
    connectionType: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    integrationStatus: string;
    phoneRegistrationRequired?: boolean;
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
    /** Never return the raw verify token — boolean only. */
    webhookVerifyTokenConfigured?: boolean;
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
  /** When true, show post-connect health checklist (e.g. after OAuth redirect). */
  showPostConnectHealth?: boolean;
}

const META_CANCELLED_MESSAGE =
  "Meta setup was cancelled. You can try again anytime.";

function localizedEmbeddedSignupError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  errorCode: string | null | undefined,
  fallback: string,
): string {
  const code = String(errorCode || "").trim() || "unknown";
  const key = `whatsappEmbeddedSignup.errors.${code}.message`;
  const translated = t(key, { defaultValue: "" });
  if (translated && translated !== key) return translated;
  // Map common aliases
  const aliasKey =
    code === "oauth_state_expired_or_invalid"
      ? "whatsappEmbeddedSignup.errors.oauth_state_expired.message"
      : code === "discovery_failed" || code === "no_valid_waba_or_phone"
        ? "whatsappEmbeddedSignup.errors.waba_validation_failed.message"
        : code === "phone_not_under_waba"
          ? "whatsappEmbeddedSignup.errors.phone_waba_mismatch.message"
          : null;
  if (aliasKey) {
    const aliased = t(aliasKey, { defaultValue: "" });
    if (aliased && aliased !== aliasKey) return aliased;
  }
  return sanitizeWhatsappClientErrorMessage(fallback);
}

type HubBanner = { variant: "error"; message: string } | { variant: "neutral"; message: string };

export function ConnectWhatsAppHub({
  onOpenTwilio,
  onOpenManualMeta,
  onClose,
  showPostConnectHealth = false,
}: ConnectWhatsAppHubProps) {
  const { t } = useTranslation();
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
  const [postConnectHealthOpen, setPostConnectHealthOpen] = useState(showPostConnectHealth);
  const [healthPollBusy, setHealthPollBusy] = useState(false);
  const [testConnectConfirmOpen, setTestConnectConfirmOpen] = useState(false);

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
    onSuccess: async () => {
      await refreshConnectionHealth(true);
      setPostConnectHealthOpen(true);
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
  const phoneRegistrationRequired =
    status?.phoneRegistrationRequired === true ||
    meta?.phoneRegistrationRequired === true ||
    meta?.integrationStatus === "needs_phone_registration";
  const metaFullyReady =
    status?.activeProvider === "meta" &&
    !phoneRegistrationRequired &&
    (status.fullyReady === true || meta?.fullyReady === true);
  const metaPartialSetup =
    status?.activeProvider === "meta" &&
    !!meta?.connected &&
    !metaFullyReady;
  const metaManageView = metaFullyReady || metaPartialSetup || phoneRegistrationRequired;
  const metaTestConnected = !!meta?.connectedToMetaTestNumber && status?.activeProvider === "meta" && !!meta?.connected;
  const readiness = status?.readiness;
  const pickerHasProduction = wabaChoices ? wabaChoicesHaveProduction(wabaChoices) : false;
  const selectedPhoneKind = findSelectedPhoneKind(wabaChoices, selectedWabaId, selectedPhoneNumberId);
  const supportMode = authedUser?.role === "owner" || authedUser?.role === "admin";

  async function refreshConnectionHealth(pollUntilReady = false): Promise<void> {
    setHealthPollBusy(true);
    try {
      for (let attempt = 0; attempt < (pollUntilReady ? 12 : 1); attempt++) {
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        const refreshQs = attempt === 0 || pollUntilReady ? "?refresh=1" : "";
        const res = await fetch(`/api/integrations/whatsapp/status${refreshQs}`, {
          credentials: "include",
        });
        if (res.ok) {
          const s = (await res.json()) as WhatsappStatusResponse;
          queryClient.setQueryData(["/api/integrations/whatsapp/status"], s);
          if (s.fullyReady || s.activeProvider !== "meta" || !pollUntilReady) break;
          if (s.phoneRegistrationRequired) break;
        }
        if (pollUntilReady && attempt < 11) {
          await new Promise((r) => setTimeout(r, 450));
        }
      }
    } finally {
      setHealthPollBusy(false);
    }
  }

  useEffect(() => {
    if (showPostConnectHealth) setPostConnectHealthOpen(true);
  }, [showPostConnectHealth]);

  async function finalizeWabaSelection() {
    if (!wabaPickerState || !selectedWabaId || !selectedPhoneNumberId) return;
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
      setTestConnectConfirmOpen(false);
      setHubBanner(null);
      setPostConnectHealthOpen(true);
      await refreshConnectionHealth(true);
    } catch (e: unknown) {
      setHubBanner({
        variant: "error",
        message: e instanceof Error ? e.message : "Could not finalize selection.",
      });
    }
  }

  function handleWabaPickerConnectClick() {
    if (!wabaPickerState || !selectedWabaId || !selectedPhoneNumberId) return;
    if (selectedPhoneKind === "test") {
      setTestConnectConfirmOpen(true);
      return;
    }
    void finalizeWabaSelection();
  }

  function getWhatsappFbSdkState(w: Window & typeof globalThis & Record<string, unknown>): WhatsappFbSdkState {
    if (!w[WCS_WHATSAPP_FB_SDK]) w[WCS_WHATSAPP_FB_SDK] = {};
    return w[WCS_WHATSAPP_FB_SDK] as WhatsappFbSdkState;
  }

  async function loadFacebookSdk(appId: string, version: string): Promise<void> {
    const w = window as FacebookSdkWindow;
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

  async function startEmbeddedSignupViaSdk(
    flow: "embedded" | "coexistence" = "embedded",
  ): Promise<void> {
    const priorSdkAppId =
      (window as Window & typeof globalThis & Record<string, unknown>)[WCS_WHATSAPP_FB_SDK] as
        | WhatsappFbSdkState
        | undefined;
    let session: EmbeddedSignupSession | null = null;
    let sessionListener: ReturnType<typeof attachEmbeddedSignupSessionListener> | null = null;
    let fbLoginInvoked = false;
    let finishEventSeen = false;
    let completeSdkAttempted = false;
    let architecture: WhatsappEmbeddedSignupArchitecture = "v2";

    try {
      setHubBanner(null);
      const start = await fetch("/api/integrations/whatsapp/meta/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ flow }),
      });
      const startJson = await start.json().catch(() => ({}));
      if (!start.ok) throw new Error(startJson?.error || "Could not start Meta signup");

      session = startJson as EmbeddedSignupSession;
      const { appId, graphApiVersion, configId } = session!.sdk;
      architecture = session!.sdk.architecture || session!.architecture || "v2";
      const loginOptions =
        session!.sdk.loginOptions ||
        buildStandardEmbeddedSignupLoginOptions({ architecture, configId });
      const appIdMissing = !appId?.trim();
      const configIdMissing = !configId?.trim();

      await loadFacebookSdk(appId, graphApiVersion);
      const w = window as Window & typeof globalThis & Record<string, unknown>;
      const sdkLoaded = !!(w.FB && typeof (w.FB as { login?: unknown }).login === "function");

      const preLoginDiag = buildEmbeddedSignupPreLoginDiagnostics({
        phase: "pre_fb_login",
        loginMethod: flow === "coexistence" ? "coexistence" : "embedded_signup",
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
        architecture,
        configIdLast4: session?.sdk?.configIdLast4 ?? null,
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

      const coordinator = createEmbeddedSignupCompletionCoordinator({
        state: session!.state,
        architecture,
        counterpartWaitMs: 2500,
        onDisposed: () => {
          sessionListener?.dispose();
        },
        completeSdk: async (payload) => {
          completeSdkAttempted = true;
          const r = await fetch("/api/integrations/whatsapp/meta/complete-sdk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              code: payload.code,
              state: payload.state,
              architecture: payload.architecture,
              sessionEvent: payload.sessionEvent,
            }),
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            const errorCode = typeof j?.errorCode === "string" ? j.errorCode : null;
            return {
              ok: false as const,
              error: localizedEmbeddedSignupError(
                t,
                errorCode,
                String(j?.error || "Could not complete Meta signup"),
              ),
              errorCode,
              wabaId: typeof j?.wabaId === "string" ? j.wabaId : null,
              httpStatus: r.status,
            };
          }
          if (j?.needsWabaPick && j?.state) {
            return { ok: true as const, needsWabaPick: true as const, state: String(j.state) };
          }
          return {
            ok: true as const,
            needsPhoneRegistration: j?.needsPhoneRegistration === true,
          };
        },
      });

      sessionListener = attachEmbeddedSignupSessionListener({
        onEvent: (event) => {
          if (
            event.event === "FINISH" ||
            event.event === "FINISH_ONLY_WABA" ||
            event.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
          ) {
            finishEventSeen = true;
          }
          console.log("[WhatsApp Embedded Signup] session_event", {
            event: event.rawEvent,
            hasWabaId: !!event.wabaId,
            hasPhoneNumberId: !!event.phoneNumberId,
            architecture,
          });
          coordinator.acceptSessionEvent(event);
        },
      });

      await new Promise<void>((resolve, reject) => {
        const loginCb = (response: unknown) => {
          const code = (response as { authResponse?: { code?: string } })?.authResponse?.code;
          if (!code) {
            const metaMsg = inferMetaLoginFailureMessage(response);
            const loginDiag = {
              ...preLoginDiag,
              phase: "fb_login_callback_no_code",
              fbResponse: redactFbLoginResponse(response),
              metaMessage: metaMsg,
              finishEventSeen,
            };
            console.warn("[WhatsApp Embedded Signup] fb_login_no_code", loginDiag);
            void postWhatsappEmbeddedSignupDiagnostics(loginDiag);

            if (metaMsg && isMetaEmbeddedSignupBlockedError(metaMsg)) {
              coordinator.failWithoutCode(new Error(META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE));
              return;
            }
            // If Meta already reported Finish, missing code is a recoverable completion error — not cancel.
            if (finishEventSeen) {
              coordinator.failWithoutCode(
                new Error(
                  "Meta finished signup but did not return an authorization code. Close Facebook windows and try Continue with Meta again — do not open a second Login tab.",
                ),
              );
              return;
            }
            coordinator.failWithoutCode(new Error(META_CANCELLED_MESSAGE));
            return;
          }
          coordinator.acceptAuthCode(code);
        };

        try {
          fbLoginInvoked = true;
          (w.FB as { login: (cb: (r: unknown) => void, opts: Record<string, unknown>) => void }).login(
            loginCb,
            loginOptions as Record<string, unknown>,
          );
        } catch (e) {
          sessionListener?.dispose();
          reject(e);
          return;
        }

        void coordinator.done
          .then(async (result: CompleteSdkResult) => {
            if (!result.ok) {
              if (result.errorCode === "phone_setup_incomplete") {
                throw new Error(
                  localizedEmbeddedSignupError(
                    t,
                    "phone_setup_incomplete",
                    result.error ||
                      "WhatsApp Business Account was created, but phone setup is incomplete. Finish the number in Meta Business Manager, then reconnect.",
                  ),
                );
              }
              throw new Error(
                localizedEmbeddedSignupError(
                  t,
                  result.errorCode,
                  result.error || "Could not complete Meta signup",
                ),
              );
            }
            if (result.needsWabaPick && result.state) {
              window.location.href = `/app/settings?section=channels&whatsapp_embedded=pick&state=${encodeURIComponent(result.state)}`;
              resolve();
              return;
            }
            setPostConnectHealthOpen(true);
            await refreshConnectionHealth(true);
            if (authedUser?.id) {
              trackWhatsappConnected({ userId: authedUser.id, embeddedSignup: true });
            }
            resolve();
          })
          .catch(reject);
      });
    } catch (e: unknown) {
      sessionListener?.dispose();
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
        architecture: session?.sdk?.architecture ?? session?.architecture ?? architecture,
        finishEventSeen,
        completeSdkAttempted,
        fbLoginInvoked,
      });

      if (blocked) {
        setHubBanner({ variant: "error", message: META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE });
        return;
      }

      if (msg === META_CANCELLED_MESSAGE || /cancelled/i.test(msg)) {
        setHubBanner({
          variant: "neutral",
          message: localizedEmbeddedSignupError(t, "dialog_cancelled", META_CANCELLED_MESSAGE),
        });
        return;
      }

      setHubBanner({
        variant: "error",
        message: sanitizeWhatsappClientErrorMessage(msg || "Could not complete Meta signup"),
      });

      const allowRedirect = shouldAutoRedirectAfterSdkFailure({
        architecture,
        fbLoginInvoked,
        finishEventSeen,
        completeSdkAttempted,
      });
      if (allowRedirect) {
        // Same server-authoritative flow + architecture as SDK start — no silent Standard/Coexistence swap.
        console.warn("[WhatsApp Embedded Signup] SDK pre-login failed; falling back to redirect.", msg);
        window.location.href = `/api/integrations/whatsapp/meta/start-redirect?flow=${encodeURIComponent(flow)}`;
      } else {
        console.warn(
          "[WhatsApp Embedded Signup] SDK completion failed; not starting redirect fallback.",
          { msg, architecture, fbLoginInvoked, finishEventSeen, completeSdkAttempted },
        );
        if (!fbLoginInvoked) {
          setHubBanner({
            variant: "error",
            message: localizedEmbeddedSignupError(
              t,
              "sdk_launch_failed",
              "We couldn't open the secure WhatsApp connection window. Please allow pop-ups and try again.",
            ),
          });
        }
        await refreshConnectionHealth(true);
      }
    }
  }

  const {
    data: coexistenceDiag,
    isFetching: diagFetching,
    refetch: refetchDiag,
  } = useQuery<CoexistenceDiagnosticsResponse>({
    queryKey: ["/api/integrations/whatsapp/coexistence-diagnostics"],
    enabled: !!metaManageView,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  const graphPhoneStatus = String(coexistenceDiag?.graphPhoneStatus ?? "").toUpperCase();
  const graphCodeStatus = String(coexistenceDiag?.graphCodeVerificationStatus ?? "").toUpperCase();
  /** `NOT_VERIFIED` alone is common on test numbers and does not prove Cloud API is off. */
  const graphPhoneDisconnected = graphPhoneStatus === "DISCONNECTED";
  const graphSubscriptionConfirmed = coexistenceDiag?.wabaSubscribedApps?.configuredAppIdPresent === true;
  const setupIncomplete =
    metaPartialSetup &&
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
      ) : metaManageView ? (
        <div className="space-y-3">
          {(postConnectHealthOpen || metaPartialSetup || phoneRegistrationRequired) && (
            <WhatsAppConnectionHealthChecklist
              readiness={readiness}
              fullyReady={metaFullyReady}
              loading={healthPollBusy || statusLoading}
              phoneRegistrationRequired={phoneRegistrationRequired}
            />
          )}

          {phoneRegistrationRequired && (
            <WhatsAppPhoneRegistrationPinForm
              onSuccess={async () => {
                await refreshConnectionHealth(true);
                setPostConnectHealthOpen(true);
                setHubBanner(null);
              }}
            />
          )}

          <div
            className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-3",
              metaTestConnected
                ? "border-amber-200 bg-amber-50/90"
                : metaFullyReady
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-amber-200 bg-amber-50/80",
            )}
          >
            {metaTestConnected ? (
              <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            ) : metaFullyReady ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 text-sm flex-1">
              <p
                className={cn(
                  "font-semibold",
                  metaTestConnected
                    ? "text-amber-900"
                    : metaFullyReady
                      ? "text-emerald-900"
                      : "text-amber-900",
                )}
              >
                {phoneRegistrationRequired
                  ? t("whatsappPhoneRegistration.statusRequired")
                  : metaTestConnected
                    ? META_TEST_NUMBER_HELP
                    : metaFullyReady
                      ? "WhatsApp connected"
                      : healthPollBusy
                        ? "Finishing WhatsApp setup…"
                        : meta?.integrationStatus === "failed"
                          ? "WhatsApp setup needs attention"
                          : "Finishing WhatsApp setup…"}
              </p>
              {metaFullyReady && meta?.displayPhoneNumber && (
                <p className="text-xs text-emerald-900/90 mt-1">
                  Connected number: {meta.displayPhoneNumber}
                </p>
              )}
              {metaFullyReady && meta?.connectionType === "coexistence" && (
                <p className="text-xs text-emerald-900/90 mt-1">
                  You can keep using the WhatsApp Business App while messages also appear in WhachatCRM.
                </p>
              )}
              {metaTestConnected && metaFullyReady && (
                <p className="text-xs text-amber-800/90 mt-1">
                  Add a production number in Meta Business Manager and reconnect to message real customers.
                </p>
              )}
              {!metaFullyReady && meta?.lastErrorMessage && (
                <p className="text-xs text-amber-900/90 mt-2">
                  {sanitizeWhatsappClientErrorMessage(meta.lastErrorMessage)}
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
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {metaFullyReady && (
              <Button type="button" size="sm" asChild>
                <a href="/app/inbox">Go to Unified Inbox</a>
              </Button>
            )}
            {metaFullyReady && meta?.connectionType === "coexistence" && cfg?.coexistenceLaunchAllowed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void startEmbeddedSignupViaSdk("coexistence")}
              >
                Reconnect this number
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={subscribeMutation.isPending || healthPollBusy}
              onClick={async () => {
                await subscribeMutation.mutateAsync();
                await refreshConnectionHealth(true);
              }}
              title="Refresh WhatsApp connection and inbound message setup"
            >
              {subscribeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              {metaFullyReady ? "Check again" : "Check again"}
            </Button>

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
              <h3 className="text-sm font-semibold text-gray-900">Connect WhatsApp to WhachatCRM</h3>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Link your WhatsApp Business number so messages appear in your Unified Inbox.
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
                    <p className="text-sm font-semibold text-gray-900">Connect WhatsApp</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Choose your business and phone number securely with Meta.
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
                disabled={!cfg?.coexistenceLaunchAllowed}
                onClick={() => {
                  if (!cfg?.coexistenceLaunchAllowed) return;
                  void startEmbeddedSignupViaSdk("coexistence");
                }}
                className={cn(
                  "w-full text-left rounded-lg border p-3 transition-colors",
                  cfg?.coexistenceLaunchAllowed
                    ? "border-blue-200 hover:bg-blue-50/50"
                    : "border-gray-100 opacity-60 cursor-not-allowed",
                )}
              >
                <div className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      Already use this number in WhatsApp Business App?
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {cfg?.coexistenceLaunchAllowed
                        ? "Keep using the WhatsApp Business App while connecting messages to WhachatCRM."
                        : "This option isn't available right now."}
                    </p>
                  </div>
                </div>
                {cfg?.coexistenceLaunchAllowed ? null : (
                  <p className="text-[10px] text-gray-500 mt-2">
                    You can still connect a WhatsApp Business number with Connect WhatsApp above.
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
            <AlertDialogTitle>Disconnect WhatsApp from WhachatCRM?</AlertDialogTitle>
            <AlertDialogDescription>
              This disconnects WhachatCRM only. Your WhatsApp Business App account and chats are not
              deleted. Inbound WhatsApp messages will stop routing here until you reconnect.
              Conversations and contacts in WhachatCRM are kept.
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
              Pick the WhatsApp number for this workspace. Production numbers are for live customers; test numbers are for Meta sandbox testing only.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pickerHasProduction ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs text-emerald-900">
              A production WhatsApp number is available — select it to message real customers. Test numbers are disabled while a production line exists.
            </div>
          ) : null}
          {selectedPhoneKind === "test" && !pickerHasProduction ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              <p className="font-semibold">Test number warning</p>
              <p className="mt-1">
                Meta test numbers cannot message real customers. Use this only for development and testing.
              </p>
            </div>
          ) : null}
          {selectedPhoneKind === "unknown" ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              This number could not be classified automatically. Confirm with Meta Business Manager that you are selecting your live business line.
            </div>
          ) : null}
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
                    const testDisabled = pickerHasProduction && kind === "test";
                    const badgeLabel =
                      kind === "test"
                        ? "Test Number"
                        : kind === "production"
                          ? "Production Number"
                          : "Unknown type";
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
                        disabled={testDisabled}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50/80",
                          selected && "bg-emerald-50",
                          testDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                        )}
                        onClick={() => {
                          if (testDisabled) return;
                          setSelectedWabaId(c.wabaId);
                          setSelectedPhoneNumberId(p.id);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-slate-900 font-medium truncate">
                            {p.displayPhoneNumber || p.verifiedName || p.id}
                          </div>
                          {p.verifiedName && p.displayPhoneNumber ? (
                            <div className="text-[11px] text-slate-500 truncate">{p.verifiedName}</div>
                          ) : null}
                          {testDisabled ? (
                            <div className="text-[11px] text-amber-800 mt-0.5">
                              Disabled — connect your production number instead.
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-semibold uppercase tracking-wide",
                            badgeClass,
                          )}
                        >
                          {badgeLabel}
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
              onClick={(e) => {
                e.preventDefault();
                handleWabaPickerConnectClick();
              }}
            >
              Connect selected account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={testConnectConfirmOpen} onOpenChange={setTestConnectConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Connect Meta test number?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to connect a Meta test number. It cannot message real customers and is intended for development and testing only. Add a production number in Meta Business Manager when you are ready to go live.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Choose a different number</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={(e) => {
                e.preventDefault();
                void finalizeWabaSelection();
              }}
            >
              Connect test number anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
