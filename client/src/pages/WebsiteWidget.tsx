import { widgetOptionLabel } from "@/lib/outreachPresentation";
import { useState, useEffect, useRef, useCallback, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Copy, Check, Smartphone, Monitor,
  AlertCircle, Plus, Trash2, X
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth-context";
import { withUserQueryScope } from "@/lib/accountQueryScope";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  buildWebchatHostedChatUrl,
  buildWebchatIframeParentSnippet,
  buildWebchatIframeSnippet,
  buildWebchatScriptSnippet,
} from "@shared/webchatWidgetSnippet";
import {
  leftoverLegacyExamplePageRules,
  NEUTRAL_WIDGET_COLOR,
  NEUTRAL_WIDGET_SETTINGS,
  resolveWidgetActivationState,
  widgetSurfaceStatus,
} from "@shared/webchatWidgetSettings";
import {
  pageRulePathInputIssue,
  pageRulesHavePathInputIssues,
  WIDGET_PAGE_RULE_MAX_ALIASES,
} from "@shared/webchatPageRuleMatch";
import {
  NEUTRAL_WEBCHAT_BRANDING,
  WEBCHAT_CHAT_ICONS,
  WEBCHAT_CORNER_STYLES,
  WEBCHAT_DEFAULT_DISPLAY_NAME,
  WEBCHAT_DEFAULT_LAUNCHER_LABEL,
  WEBCHAT_DEFAULT_SUBTITLE,
  WEBCHAT_LAUNCHER_STYLES,
  WEBCHAT_OPEN_BEHAVIORS,
  WEBCHAT_PANEL_WIDTHS,
  sanitizeWidgetHexColor,
  sanitizeWidgetLogoUrl,
  widgetTextContainsUnsafeMarkup,
  type WebchatChatIcon,
  type WebchatCornerStyle,
  type WebchatLauncherStyle,
  type WebchatOpenBehavior,
  type WebchatPanelWidth,
} from "@shared/webchatWidgetBranding";
import {
  coerceWidgetLogoUrl,
  markWidgetLogoPreviewFailed,
  runWidgetLogoUpload,
  shouldResetWidgetLogoPreview,
  WIDGET_LOGO_ACCEPT,
  widgetLogoEditorDisplayName,
  widgetLogoEditorHasImage,
  widgetSettingsPatchLogoUrl,
  type WidgetLogoUploadLock,
} from "@shared/webchatWidgetLogoUpload";
import { WebchatChromePreview } from "@/components/webchat/WebchatChromePreview";
import type { WebchatChromeState } from "@shared/webchatWidgetChrome";
import type { WidgetCopyI18nFields, WidgetCopyI18nMap } from "@shared/webchatWidgetCopyI18n";
import { builderLocalizedInputProps } from "@shared/webchatWidgetLocale";

export const WIDGET_LOGO_FILE_INPUT_ID = "widget-logo-file";

/** Bound window.fetch so logo POST always reaches the network (unbound `fetch` can throw). */
export function widgetLogoBoundFetch(url: string, init?: RequestInit): Promise<Response> {
  return globalThis.fetch(url, init);
}

export function resetWidgetLogoFileInput(input: { value: string } | HTMLInputElement | null | undefined): void {
  if (input) input.value = "";
}

/** Clear stale errors, reset the input, then open the native picker so the same file can be re-selected. */
export function openWidgetLogoFilePicker(
  input: HTMLInputElement | null | undefined,
  onClearError?: () => void,
): boolean {
  onClearError?.();
  if (!input) return false;
  resetWidgetLogoFileInput(input);
  input.click();
  return true;
}

function WidgetLogoFieldThumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  const [current, setCurrent] = useState(src);
  useEffect(() => {
    if (shouldResetWidgetLogoPreview(current, src)) {
      setFailed(false);
      setCurrent(src);
    }
  }, [src, current]);
  if (!src || failed) {
    return (
      <div
        className="h-10 w-10 shrink-0 rounded-md border border-gray-200 bg-gray-100"
        data-testid="widget-logo-thumb-fallback"
        aria-hidden="true"
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 rounded-md border border-gray-200 object-cover"
      referrerPolicy="no-referrer"
      data-testid="widget-logo-thumb"
      onError={() => setFailed((prev) => markWidgetLogoPreviewFailed(prev))}
    />
  );
}

/** Website Chat Widget settings — Inbox channel `webchat`, not WhatsApp click-to-chat. */

export type WidgetTriggerType = "always" | "delay" | "scroll" | "exit_intent";

export interface WidgetPageRule {
  /** Stable list key (client-only; stripped before save). */
  id: string;
  urlContains: string;
  /** Exact-path extras only. Omitted for Contains / Path prefix. */
  urlAliases?: string[];
  matchType?: "contains" | "pathname" | "pathname_prefix";
  greeting: string;
  teaserGreeting?: string;
  prefilledMessage: string;
  suggestedQuestions?: string[];
  chatbotFlowId?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  localized?: {
    en?: { greeting?: string; teaserGreeting?: string; suggestedQuestions?: string[] };
    es?: { greeting?: string; teaserGreeting?: string; suggestedQuestions?: string[] };
    he?: { greeting?: string; teaserGreeting?: string; suggestedQuestions?: string[] };
  };
}

interface WidgetSettings {
  enabled: boolean;
  color: string;
  welcomeMessage: string;
  position: "right" | "left";
  showOnMobile: boolean;
  showOnDesktop: boolean;
  triggerType: WidgetTriggerType;
  triggerDelaySeconds: number;
  triggerScrollPercent: number;
  pageRules: WidgetPageRule[];
  widgetPublicId?: string;
  allowedOrigins?: string[];
  allowAnyOrigin?: boolean;
  launcherStyle: WebchatLauncherStyle;
  launcherLabel: string;
  brandName: string;
  logoUrl: string;
  panelHeading: string;
  panelSubtitle: string;
  accentColor: string;
  headerTextColor: "auto" | string;
  cornerStyle: WebchatCornerStyle;
  panelWidth: WebchatPanelWidth;
  openBehavior: WebchatOpenBehavior;
  teaserGreeting: string;
  chatIcon: WebchatChatIcon;
  inputPlaceholder?: string;
  offlineMessage?: string;
  localized?: WidgetCopyI18nMap;
  businessProfileName?: string;
  agentName?: string;
  originDiagnostics?: {
    canPubliclyEmbed?: boolean;
    reason?: string;
  };
  webchatServerAi?: {
    rolloutEnabled?: boolean;
    allowlisted?: boolean;
    unattendedEligible?: boolean;
  };
}

const DEFAULT_SETTINGS: WidgetSettings = {
  enabled: NEUTRAL_WIDGET_SETTINGS.enabled,
  color: NEUTRAL_WIDGET_SETTINGS.color,
  welcomeMessage: NEUTRAL_WIDGET_SETTINGS.welcomeMessage,
  position: NEUTRAL_WIDGET_SETTINGS.position,
  showOnMobile: NEUTRAL_WIDGET_SETTINGS.showOnMobile,
  showOnDesktop: NEUTRAL_WIDGET_SETTINGS.showOnDesktop,
  triggerType: NEUTRAL_WIDGET_SETTINGS.triggerType,
  triggerDelaySeconds: NEUTRAL_WIDGET_SETTINGS.triggerDelaySeconds,
  triggerScrollPercent: NEUTRAL_WIDGET_SETTINGS.triggerScrollPercent,
  pageRules: [],
  allowedOrigins: [],
  allowAnyOrigin: false,
  ...NEUTRAL_WEBCHAT_BRANDING,
};

function mergeWidgetSettings(input: Partial<WidgetSettings> | undefined): WidgetSettings {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_SETTINGS, pageRules: [] };
  }
  return {
    ...DEFAULT_SETTINGS,
    ...input,
    pageRules: Array.isArray(input.pageRules)
      ? normalizePageRulesFromServer(input.pageRules as WidgetPageRule[])
      : [],
    allowAnyOrigin: input.allowAnyOrigin === true,
    enabled: input.enabled === true,
    logoUrl: coerceWidgetLogoUrl(input.logoUrl),
    launcherLabel: typeof input.launcherLabel === "string" ? input.launcherLabel : DEFAULT_SETTINGS.launcherLabel,
    brandName: typeof input.brandName === "string" ? input.brandName : DEFAULT_SETTINGS.brandName,
    panelHeading: typeof input.panelHeading === "string" ? input.panelHeading : DEFAULT_SETTINGS.panelHeading,
    panelSubtitle: typeof input.panelSubtitle === "string" ? input.panelSubtitle : DEFAULT_SETTINGS.panelSubtitle,
    teaserGreeting: typeof input.teaserGreeting === "string" ? input.teaserGreeting : DEFAULT_SETTINGS.teaserGreeting,
    inputPlaceholder: typeof input.inputPlaceholder === "string" ? input.inputPlaceholder : "",
    offlineMessage: typeof input.offlineMessage === "string" ? input.offlineMessage : "",
    localized: input.localized && typeof input.localized === "object" ? input.localized : {},
  };
}

const COLOR_PRESETS = [
  { name: "Brand Green", value: NEUTRAL_WIDGET_COLOR },
  { name: "Green", value: "#25D366" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Orange", value: "#f97316" },
  { name: "Pink", value: "#ec4899" },
];

function newRuleId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Ensure every rule has an id for stable React keys (API may omit id). */
function normalizePageRulesFromServer(
  rules: Array<{
    urlContains?: string;
    urlAliases?: string[];
    matchType?: WidgetPageRule["matchType"];
    greeting?: string;
    teaserGreeting?: string;
    prefilledMessage?: string;
    suggestedQuestions?: string[];
    chatbotFlowId?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    localized?: WidgetPageRule["localized"];
    id?: string;
  }>
): WidgetPageRule[] {
  return rules.map((r) => ({
    urlContains: String(r.urlContains ?? ""),
    urlAliases:
      r.matchType === "pathname" && Array.isArray(r.urlAliases)
        ? r.urlAliases.map((alias) => String(alias)).map((alias) => alias.trim()).filter(Boolean).slice(0, WIDGET_PAGE_RULE_MAX_ALIASES)
        : [],
    matchType:
      r.matchType === "pathname" || r.matchType === "pathname_prefix" || r.matchType === "contains"
        ? r.matchType
        : undefined,
    greeting: String(r.greeting ?? ""),
    teaserGreeting: String(r.teaserGreeting ?? ""),
    prefilledMessage: String(r.prefilledMessage ?? ""),
    suggestedQuestions: Array.isArray(r.suggestedQuestions)
      ? r.suggestedQuestions.map((q) => String(q)).filter(Boolean).slice(0, 8)
      : [],
    chatbotFlowId: typeof r.chatbotFlowId === "string" ? r.chatbotFlowId : "",
    ctaLabel: typeof r.ctaLabel === "string" ? r.ctaLabel : "",
    ctaUrl: typeof r.ctaUrl === "string" ? r.ctaUrl : "",
    localized:
      r.localized && typeof r.localized === "object"
        ? {
            en: {
              greeting: String(r.localized.en?.greeting || ""),
              teaserGreeting: String(r.localized.en?.teaserGreeting || ""),
              suggestedQuestions: Array.isArray(r.localized.en?.suggestedQuestions)
                ? r.localized.en!.suggestedQuestions.map((q) => String(q)).filter(Boolean).slice(0, 8)
                : [],
            },
            es: {
              greeting: String(r.localized.es?.greeting || ""),
              teaserGreeting: String(r.localized.es?.teaserGreeting || ""),
              suggestedQuestions: Array.isArray(r.localized.es?.suggestedQuestions)
                ? r.localized.es!.suggestedQuestions.map((q) => String(q)).filter(Boolean).slice(0, 8)
                : [],
            },
            he: {
              greeting: String(r.localized.he?.greeting || ""),
              teaserGreeting: String(r.localized.he?.teaserGreeting || ""),
              suggestedQuestions: Array.isArray(r.localized.he?.suggestedQuestions)
                ? r.localized.he!.suggestedQuestions.map((q) => String(q)).filter(Boolean).slice(0, 8)
                : [],
            },
          }
        : undefined,
    id: typeof r.id === "string" && r.id.length > 0 ? r.id : newRuleId(),
  }));
}

function brandingFieldError(
  settings: Pick<
    WidgetSettings,
    | "logoUrl"
    | "accentColor"
    | "headerTextColor"
    | "brandName"
    | "launcherLabel"
    | "panelHeading"
    | "panelSubtitle"
    | "teaserGreeting"
    | "welcomeMessage"
  >,
): {
  logo?: string;
  color?: string;
  brandName?: string;
  launcherLabel?: string;
  panelHeading?: string;
  panelSubtitle?: string;
  teaserGreeting?: string;
  welcomeMessage?: string;
} {
  const errors: {
    logo?: string;
    color?: string;
    brandName?: string;
    launcherLabel?: string;
    panelHeading?: string;
    panelSubtitle?: string;
    teaserGreeting?: string;
    welcomeMessage?: string;
  } = {};
  const logoUrl = coerceWidgetLogoUrl(settings.logoUrl);
  if (logoUrl.trim() && !sanitizeWidgetLogoUrl(logoUrl)) {
    errors.logo = "Logo must be an uploaded JPEG, PNG, or WebP (first-party /objects/uploads path). Remote URLs are not used.";
  }
  if (settings.accentColor && !sanitizeWidgetHexColor(settings.accentColor)) {
    errors.color = "accent";
  }
  if (settings.headerTextColor !== "auto" && !sanitizeWidgetHexColor(settings.headerTextColor)) {
    errors.color = errors.color || "header";
  }
  const markup = "HTML, scripts, and markup are not allowed.";
  if (widgetTextContainsUnsafeMarkup(settings.brandName)) errors.brandName = markup;
  if (widgetTextContainsUnsafeMarkup(settings.launcherLabel)) errors.launcherLabel = markup;
  if (widgetTextContainsUnsafeMarkup(settings.panelHeading)) errors.panelHeading = markup;
  if (widgetTextContainsUnsafeMarkup(settings.panelSubtitle)) errors.panelSubtitle = markup;
  if (widgetTextContainsUnsafeMarkup(settings.teaserGreeting)) errors.teaserGreeting = markup;
  if (widgetTextContainsUnsafeMarkup(settings.welcomeMessage)) errors.welcomeMessage = markup;
  return errors;
}

function stripPageRuleIds(settings: WidgetSettings): Omit<
  WidgetSettings,
  "pageRules" | "widgetPublicId" | "originDiagnostics" | "webchatServerAi" | "businessProfileName" | "agentName"
> & {
  pageRules: {
    urlContains: string;
    urlAliases?: string[];
    matchType?: WidgetPageRule["matchType"];
    greeting: string;
    teaserGreeting?: string;
    prefilledMessage: string;
    suggestedQuestions?: string[];
    chatbotFlowId?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    localized?: WidgetPageRule["localized"];
  }[];
} {
  return {
    enabled: settings.enabled,
    color: settings.color,
    welcomeMessage: settings.welcomeMessage,
    position: settings.position,
    showOnMobile: settings.showOnMobile,
    showOnDesktop: settings.showOnDesktop,
    triggerType: settings.triggerType,
    triggerDelaySeconds: settings.triggerDelaySeconds,
    triggerScrollPercent: settings.triggerScrollPercent,
    allowedOrigins: settings.allowedOrigins,
    allowAnyOrigin: settings.allowAnyOrigin === true,
    launcherStyle: settings.launcherStyle,
    launcherLabel: settings.launcherLabel,
    brandName: settings.brandName,
    logoUrl: coerceWidgetLogoUrl(settings.logoUrl),
    panelHeading: settings.panelHeading,
    panelSubtitle: settings.panelSubtitle,
    accentColor: settings.accentColor,
    headerTextColor: settings.headerTextColor,
    cornerStyle: settings.cornerStyle,
    panelWidth: settings.panelWidth,
    openBehavior: settings.openBehavior,
    teaserGreeting: settings.teaserGreeting,
    chatIcon: settings.chatIcon,
    inputPlaceholder: settings.inputPlaceholder || "",
    offlineMessage: settings.offlineMessage || "",
    localized: settings.localized || {},
    pageRules: settings.pageRules.map(
      ({ urlContains, urlAliases, matchType, greeting, teaserGreeting, prefilledMessage, suggestedQuestions, chatbotFlowId, ctaLabel, ctaUrl, localized }) => {
        const aliases =
          matchType === "pathname"
            ? (urlAliases || []).map((alias) => alias.trim()).filter(Boolean).slice(0, WIDGET_PAGE_RULE_MAX_ALIASES)
            : [];
        return {
        urlContains,
        ...(aliases.length ? { urlAliases: aliases } : {}),
        ...(matchType ? { matchType } : {}),
        greeting,
        ...(teaserGreeting ? { teaserGreeting } : {}),
        prefilledMessage,
        suggestedQuestions: suggestedQuestions?.filter(Boolean).slice(0, 8) || [],
        chatbotFlowId: chatbotFlowId || "",
        ctaLabel: ctaLabel || "",
        ctaUrl: ctaUrl || "",
        localized,
        };
      },
    ),
  };
}

const PREVIEW_STATES: WebchatChromeState[] = ["collapsed", "teaser", "open"];

function WidgetPreview({
  settings,
  businessName,
  agentName,
  state,
  onStateChange,
  viewport,
  onViewportChange,
}: {
  settings: WidgetSettings;
  businessName?: string | null;
  agentName?: string | null;
  state: WebchatChromeState;
  onStateChange: (state: WebchatChromeState) => void;
  viewport: "desktop" | "mobile";
  onViewportChange: (viewport: "desktop" | "mobile") => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="flex p-0.5 bg-gray-100 rounded-lg">
          <button
            type="button"
            onClick={() => onViewportChange("desktop")}
            className={cn(
              "inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
              viewport === "desktop" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
            )}
            data-testid="button-preview-desktop"
          >
            <Monitor className="h-3.5 w-3.5" />
            {t("widgetSettingsUi.desktop")}
          </button>
          <button
            type="button"
            onClick={() => onViewportChange("mobile")}
            className={cn(
              "inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all",
              viewport === "mobile" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
            )}
            data-testid="button-preview-mobile"
          >
            <Smartphone className="h-3.5 w-3.5" />
            {t("widgetSettingsUi.mobile")}
          </button>
        </div>
        <div className="flex flex-wrap flex-1 gap-1 rounded-lg bg-gray-100 p-0.5">
          {PREVIEW_STATES.map((previewState) => (
            <button
              type="button"
              key={previewState}
              onClick={() => onStateChange(previewState)}
              className={cn(
                "flex-1 min-w-[5.5rem] py-1.5 text-xs font-medium rounded-md transition-all",
                state === previewState ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
              )}
              data-testid={`button-preview-${previewState}`}
            >
              {previewState === "collapsed" ? t("outreachUi.collapsed") : previewState === "teaser" ? t("outreachUi.teaser") : t("outreachUi.openChat")}
            </button>
          ))}
        </div>
      </div>
      <div className={cn(viewport === "mobile" && "max-w-[390px] overflow-x-hidden")}>
        <WebchatChromePreview
          settings={settings as unknown as Record<string, unknown>}
          businessName={businessName}
          agentName={agentName}
          state={state}
        />
      </div>
    </div>
  );
}

export function WebsiteWidget() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const originsSectionRef = useRef<HTMLDivElement | null>(null);
  const [copiedType, setCopiedType] = useState<
    "script" | "iframe" | "iframeParent" | "hosted" | null
  >(null);
  const [settings, setSettings] = useState<WidgetSettings>(() => ({
    ...DEFAULT_SETTINGS,
    pageRules: [],
  }));
  const [enableBlockedHint, setEnableBlockedHint] = useState(false);
  const [leadSource, setLeadSource] = useState("");
  const [previewState, setPreviewState] = useState<WebchatChromeState>("collapsed");
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop");
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);
  const [logoDisplayName, setLogoDisplayName] = useState("Logo uploaded");
  const [logoRemoveOpen, setLogoRemoveOpen] = useState(false);
  const [saveQueued, setSaveQueued] = useState(false);
  const [clearedAliasNoticeIds, setClearedAliasNoticeIds] = useState<Set<string>>(() => new Set());
  /** Avoid resetting local form on every widget-settings refetch (fixes Page Rules focus / cursor bugs). */
  const didHydrateFromWidgetQuery = useRef(false);
  const pageRulesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandingTextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brandingTextPendingRef = useRef(false);
  const settingsRef = useRef(settings);
  const lastSavedLogoRef = useRef("");
  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const logoUploadLockRef = useRef<WidgetLogoUploadLock>({ inFlight: false });
  const savePendingRef = useRef(false);
  const persistWidgetSettingsRef = useRef<(next: WidgetSettings) => void>(() => {});

  settingsRef.current = settings;

  const clearPageRulesSaveDebounce = useCallback(() => {
    if (pageRulesSaveTimerRef.current !== null) {
      clearTimeout(pageRulesSaveTimerRef.current);
      pageRulesSaveTimerRef.current = null;
    }
  }, []);

  const clearBrandingTextDebounce = useCallback(() => {
    if (brandingTextTimerRef.current !== null) {
      clearTimeout(brandingTextTimerRef.current);
      brandingTextTimerRef.current = null;
    }
    brandingTextPendingRef.current = false;
  }, []);

  const widgetSettingsQueryKey = withUserQueryScope(["/api/widget-settings"], user?.id);
  const { data: savedSettings, isError: widgetLoadError, refetch: retryWidgetLoad } = useQuery<WidgetSettings>({
    queryKey: widgetSettingsQueryKey,
    enabled: !!user?.id,
    staleTime: 0,
  });
  const { data: chatbotFlows } = useQuery<Array<{ id: string; name: string; isActive?: boolean }>>({
    queryKey: withUserQueryScope(["/api/chatbot-flows"], user?.id),
    enabled: !!user?.id,
  });
  const { data: aiSettings } = useQuery<{ aiMode?: string }>({
    queryKey: ["/api/ai/settings"],
    enabled: !!user?.id,
  });
  const { data: subscription } = useQuery<{ limits?: { effectiveHasAIBrain?: boolean } }>({
    queryKey: ["/api/subscription"],
    enabled: !!user?.id,
  });
  
  useEffect(() => {
    if (savedSettings === undefined) return;
    if (didHydrateFromWidgetQuery.current) return;
    const merged = mergeWidgetSettings(savedSettings);
    setSettings(merged);
    lastSavedLogoRef.current = coerceWidgetLogoUrl(merged.logoUrl);
    didHydrateFromWidgetQuery.current = true;
  }, [savedSettings]);
  
  const saveMutation = useMutation({
    mutationFn: async (newSettings: WidgetSettings) => {
      return apiRequest("PATCH", "/api/widget-settings", stripPageRuleIds(newSettings));
    },
    onSuccess: async (res, saved) => {
      lastSavedLogoRef.current = coerceWidgetLogoUrl(saved.logoUrl);
      let payload: Record<string, unknown> = { ...saved };
      try {
        const json = (await res.json()) as Record<string, unknown>;
        if (json && typeof json === "object") payload = json;
      } catch {
        /* keep local saved snapshot */
      }
      queryClient.setQueryData(widgetSettingsQueryKey, (prev: WidgetSettings | undefined) => ({
        ...(prev || {}),
        ...payload,
      } as WidgetSettings));
      queryClient.invalidateQueries({ queryKey: ["/api/widget-settings"] });
    },
  });
  savePendingRef.current = saveMutation.isPending;

  const persistWidgetSettings = useCallback(
    (next: WidgetSettings) => {
      setSaveQueued(false);
      const fieldErrors = brandingFieldError(next);
      if (
        fieldErrors.brandName ||
        fieldErrors.launcherLabel ||
        fieldErrors.panelHeading ||
        fieldErrors.panelSubtitle ||
        fieldErrors.teaserGreeting ||
        fieldErrors.welcomeMessage
      ) {
        return;
      }
      const logoUrl = widgetSettingsPatchLogoUrl(next.logoUrl, lastSavedLogoRef.current);
      const accentInvalid = Boolean(next.accentColor && !sanitizeWidgetHexColor(next.accentColor));
      const headerInvalid =
        next.headerTextColor !== "auto" && !sanitizeWidgetHexColor(next.headerTextColor);
      if (pageRulesHavePathInputIssues(next.pageRules)) {
        return;
      }
      saveMutation.mutate({
        ...next,
        logoUrl,
        accentColor: accentInvalid ? "" : sanitizeWidgetHexColor(next.accentColor, next.accentColor),
        headerTextColor: headerInvalid
          ? "auto"
          : next.headerTextColor === "auto"
            ? "auto"
            : sanitizeWidgetHexColor(next.headerTextColor, "auto"),
      });
    },
    [saveMutation]
  );
  persistWidgetSettingsRef.current = persistWidgetSettings;

  const schedulePageRulesDebouncedSave = useCallback(
    (next: WidgetSettings) => {
      if (pageRulesHavePathInputIssues(next.pageRules)) {
        setSaveQueued(false);
        clearPageRulesSaveDebounce();
        return;
      }
      setSaveQueued(true);
      clearPageRulesSaveDebounce();
      pageRulesSaveTimerRef.current = setTimeout(() => {
        pageRulesSaveTimerRef.current = null;
        persistWidgetSettings(next);
      }, 550);
    },
    [clearPageRulesSaveDebounce, persistWidgetSettings]
  );

  const scheduleBrandingTextDebouncedSave = useCallback(
    (next: WidgetSettings) => {
      setSaveQueued(true);
      clearBrandingTextDebounce();
      brandingTextPendingRef.current = true;
      brandingTextTimerRef.current = setTimeout(() => {
        brandingTextTimerRef.current = null;
        brandingTextPendingRef.current = false;
        persistWidgetSettings(next);
      }, 550);
    },
    [clearBrandingTextDebounce, persistWidgetSettings]
  );
  
  const updateSettings = (updates: Partial<WidgetSettings>) => {
    clearPageRulesSaveDebounce();
    clearBrandingTextDebounce();
    let next!: WidgetSettings;
    setSettings((prev) => {
      next = { ...prev, ...updates };
      return next;
    });
    persistWidgetSettings(next);
  };

  const onLogoFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.currentTarget;
      const file = inputEl.files?.[0] ?? null;
      setLogoUploadError(null);
      const priorLogoUrl =
        coerceWidgetLogoUrl(lastSavedLogoRef.current) || coerceWidgetLogoUrl(settingsRef.current.logoUrl);
      try {
        const result = await runWidgetLogoUpload({
          file,
          priorLogoUrl,
          lock: logoUploadLockRef.current,
          fetchFn: widgetLogoBoundFetch,
          onBusyChange: setLogoBusy,
        });
        if (result.ok) {
          setLogoDisplayName(widgetLogoEditorDisplayName(file && "name" in file ? file.name : undefined));
          const next = {
            ...settingsRef.current,
            logoUrl: result.logoUrl,
          };
          setSettings(next);
          persistWidgetSettingsRef.current(next);
          return;
        }
        if (!result.skipped) {
          setLogoUploadError(result.error);
        }
      } finally {
        resetWidgetLogoFileInput(inputEl);
      }
    },
    [],
  );

  const updateBrandingText = (updates: Partial<WidgetSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      scheduleBrandingTextDebouncedSave(next);
      return next;
    });
  };

  const updateLocalizedCopy = (loc: "es" | "he", patch: WidgetCopyI18nFields) => {
    updateBrandingText({
      localized: {
        ...(settings.localized || {}),
        [loc]: { ...(settings.localized?.[loc] || {}), ...patch },
      },
    });
  };

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (brandingTextPendingRef.current || savePendingRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (brandingTextTimerRef.current !== null) {
        clearTimeout(brandingTextTimerRef.current);
        brandingTextTimerRef.current = null;
        brandingTextPendingRef.current = false;
        persistWidgetSettingsRef.current(settingsRef.current);
      }
      if (pageRulesSaveTimerRef.current !== null) {
        clearTimeout(pageRulesSaveTimerRef.current);
        pageRulesSaveTimerRef.current = null;
        persistWidgetSettingsRef.current(settingsRef.current);
      }
    };
  }, []);
  
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  // widget.js is a stable loader; ?id= selects the tenant and live branding is fetched no-store.
  // fetchpriority="low" tells the browser to deprioritise this script behind page-critical assets.
  // The setTimeout(fn, 1) wrapper defers execution until after the first paint on mobile.
  const widgetPublicId = savedSettings?.widgetPublicId || "";
  const scriptCode = buildWebchatScriptSnippet({ baseUrl, widgetPublicId });
  const iframeFloatingCode = buildWebchatIframeSnippet({ baseUrl, widgetPublicId });
  const iframeWithParentScript = buildWebchatIframeParentSnippet({ baseUrl, widgetPublicId });

  const hostedLinkUrl = buildWebchatHostedChatUrl({ baseUrl, widgetPublicId, leadSource });

  const copyScript = () => {
    if (!scriptCode) return;
    navigator.clipboard.writeText(scriptCode);
    setCopiedType("script");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyIframe = () => {
    if (!iframeFloatingCode) return;
    navigator.clipboard.writeText(iframeFloatingCode);
    setCopiedType("iframe");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyIframeWithParentScript = () => {
    if (!iframeWithParentScript) return;
    navigator.clipboard.writeText(iframeWithParentScript);
    setCopiedType("iframeParent");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const copyHostedLink = () => {
    if (!hostedLinkUrl) return;
    navigator.clipboard.writeText(hostedLinkUrl);
    setCopiedType("hosted");
    setTimeout(() => setCopiedType(null), 2000);
  };

  const updatePageRule = (index: number, patch: Partial<WidgetPageRule>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        pageRules: prev.pageRules.map((r, i) =>
          i === index ? { ...r, ...patch, id: r.id } : r
        ),
      };
      schedulePageRulesDebouncedSave(next);
      return next;
    });
  };

  const addPageRule = () => {
    setSettings((prev) => {
      const next = {
        ...prev,
        pageRules: [
          ...prev.pageRules,
          { id: newRuleId(), urlContains: "", matchType: "pathname", greeting: "", prefilledMessage: "" },
        ],
      };
      schedulePageRulesDebouncedSave(next);
      return next;
    });
  };

  const removePageRule = (index: number) => {
    if (!window.confirm("Remove this page rule?")) return;
    clearPageRulesSaveDebounce();
    setSettings((prev) => {
      const removed = prev.pageRules[index];
      if (removed) {
        setClearedAliasNoticeIds((ids) => {
          if (!ids.has(removed.id)) return ids;
          const next = new Set(ids);
          next.delete(removed.id);
          return next;
        });
      }
      const next = {
        ...prev,
        pageRules: prev.pageRules.filter((_, i) => i !== index),
      };
      persistWidgetSettings(next);
      return next;
    });
  };

  const changePageRuleMatchType = (index: number, matchType: WidgetPageRule["matchType"]) => {
    const current = settings.pageRules[index];
    const hadAliases = (current?.urlAliases || []).some((alias) => String(alias).trim());
    if (matchType !== "pathname" && hadAliases && current) {
      setClearedAliasNoticeIds((ids) => new Set(ids).add(current.id));
    } else if (matchType === "pathname" && current) {
      setClearedAliasNoticeIds((ids) => {
        const next = new Set(ids);
        next.delete(current.id);
        return next;
      });
    }
    updatePageRule(index, {
      matchType,
      urlAliases: matchType === "pathname" ? current?.urlAliases || [] : [],
    });
  };

  const activation = resolveWidgetActivationState(settings);
  const surface = widgetSurfaceStatus(activation);
  const statusLabel = surface.switchChecked
    ? t("automations.active")
    : surface.channelPill === "needs_attention" ? t("outreachUi.inactive") : t("outreachUi.disabled");
  const showOriginHint = Boolean(surface.originHint) || enableBlockedHint;
  const showLeftoverLegacyRules = leftoverLegacyExamplePageRules(settings);
  const brandingErrors = brandingFieldError(settings);
  const pageRulePathIssues = pageRulesHavePathInputIssues(settings.pageRules);
  const pageRulesSaveStatus =
    saveQueued || saveMutation.isPending
      ? t("widgetSettingsUi.saving")
      : saveMutation.isError
        ? t("outreachUi.saveError")
        : pageRulePathIssues
          ? ""
          : saveMutation.isSuccess
            ? t("outreachUi.saved")
            : "";

  const focusDomainSetup = () => {
    setEnableBlockedHint(true);
    originsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const el = document.querySelector<HTMLTextAreaElement>("[data-testid='input-allowed-origins']");
    el?.focus();
  };
  
  if (widgetLoadError && savedSettings === undefined) return (
    <div role="alert" className="flex flex-wrap gap-2 p-4">
      {t("outreachUi.loadWidget")}
      <Button type="button" variant="outline" onClick={() => void retryWidgetLoad()}>{t("common.tryAgain")}</Button>
    </div>
  );

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-gray-50/50">
      <div className="p-3 sm:p-4 md:p-6 max-w-4xl mx-auto pb-20">
        <div className="mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900" data-testid="text-page-title">
            {t("widgetPage.title", "Website Chat Widget")}
          </h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm max-w-xl">
            {t(
              "widgetPage.subtitle",
              "Capture, qualify and assist website visitors directly inside your unified Inbox.",
            )}
          </p>
        </div>

        <div className="space-y-4 sm:space-y-5">
          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 bg-white">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg font-bold">{t("widgetSettingsUi.status")}</CardTitle>
                  <CardDescription className="text-xs">{t("widgetSettingsUi.availability")}</CardDescription>
                </div>
                <Switch
                  checked={surface.switchChecked}
                  onCheckedChange={(enabled) => {
                    if (enabled && !activation.hasOriginPrerequisite) {
                      focusDomainSetup();
                      return;
                    }
                    setEnableBlockedHint(false);
                    updateSettings({ enabled });
                  }}
                  data-testid="switch-widget-enabled"
                  className="data-[state=checked]:bg-emerald-500 shrink-0"
                />
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gray-50 border border-gray-100 w-fit">
                {surface.switchChecked ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-700 font-medium" data-testid="text-widget-effective-status">
                      {statusLabel}
                    </span>
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-gray-400" />
                    <span className="text-xs text-gray-600" data-testid="text-widget-effective-status">
                      {statusLabel}
                    </span>
                  </>
                )}
              </div>
              {showOriginHint && (
                <p className="text-xs text-amber-800" data-testid="text-origin-required">
                  {t("widgetSettingsUi.domainRequired")}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <Monitor className="w-4 h-4 text-gray-600" />
                  {t("templates.preview")}
                </CardTitle>
                <span
                  className="text-[11px] text-gray-500"
                  data-testid="text-widget-save-status"
                >
                  {saveQueued || saveMutation.isPending
                    ? t("widgetSettingsUi.saving")
                    : saveMutation.isError
                      ? t("outreachUi.saveError")
                      : saveMutation.isSuccess
                        ? t("outreachUi.saved")
                        : ""}
                </span>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-2">
              <WidgetPreview
                settings={settings}
                businessName={settings.businessProfileName || ""}
                agentName={settings.agentName || ""}
                state={previewState}
                onStateChange={setPreviewState}
                viewport={previewViewport}
                onViewportChange={setPreviewViewport}
              />
              {saveMutation.isError ? (
                <p className="text-xs text-red-600" data-testid="text-widget-save-error">
                  {t("widgetSettingsUi.saveFailed")}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl" data-testid="section-launcher-branding">
            <CardHeader className="px-3 py-2 sm:px-4 sm:py-2.5 pb-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-base sm:text-lg font-bold">{t("widgetSettingsUi.branding")}</CardTitle>
                  <CardDescription className="text-[11px] sm:text-xs leading-snug">
                    {t("widgetAdmin.brandingHint")}
                  </CardDescription>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" data-testid="button-reset-branding">
                      {t("widgetSettingsUi.resetDefault")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("widgetSettingsUi.resetConfirm")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("widgetAdmin.resetHint")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        data-testid="button-confirm-reset-branding"
                        onClick={() => updateSettings({ ...NEUTRAL_WEBCHAT_BRANDING })}
                      >
                        {t("widgetSettingsUi.reset")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </CardHeader>
            <CardContent className="px-3 py-2 sm:px-4 sm:pb-3 pt-2 space-y-3">
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">{t("widgetSettingsUi.launcherStyle")}</Label>
                <div className="flex p-0.5 bg-gray-100 rounded-lg">
                  {WEBCHAT_LAUNCHER_STYLES.map((style) => (
                    <button
                      type="button"
                      key={style}
                      onClick={() => updateSettings({ launcherStyle: style })}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                        settings.launcherStyle === style ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                      )}
                      data-testid={`button-launcher-${style}`}
                    >
                      {style === "circle" ? t("widgetSettingsUi.circle") : style === "pill" ? t("outreachUi.pill") : t("outreachUi.card")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="brand-name" className="text-[11px] font-semibold text-gray-600">
                    {t("workspaceUi.businessName")}
                  </Label>
                  <Input
                    id="brand-name"
                    value={settings.brandName}
                    onChange={(e) => updateBrandingText({ brandName: e.target.value })}
                    placeholder={
                      settings.businessProfileName
                        ? settings.businessProfileName
                        : WEBCHAT_DEFAULT_DISPLAY_NAME
                    }
                    className="h-9 text-sm border-gray-200 rounded-lg"
                    data-testid="input-brand-name"
                  />
                  {brandingErrors.brandName ? (
                    <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                      {t("outreachUi.markup")}
                    </p>
                  ) : (
                  <p className="text-[10px] text-gray-500">
                    {t("widgetAdmin.brandPlaceholder")}
                  </p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="launcher-label" className="text-[11px] font-semibold text-gray-600">
                    {t("widgetEditor.launcherLabel")}
                  </Label>
                  <Input
                    id="launcher-label"
                    value={settings.launcherLabel}
                    onChange={(e) => updateBrandingText({ launcherLabel: e.target.value })}
                    placeholder={WEBCHAT_DEFAULT_LAUNCHER_LABEL}
                    className="h-9 text-sm border-gray-200 rounded-lg"
                    data-testid="input-launcher-label"
                    disabled={settings.launcherStyle === "circle"}
                  />
                  {brandingErrors.launcherLabel ? (
                    <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                      {t("outreachUi.markup")}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="panel-heading" className="text-[11px] font-semibold text-gray-600">
                    {t("widgetEditor.panelHeading")}
                  </Label>
                  <Input
                    id="panel-heading"
                    value={settings.panelHeading}
                    onChange={(e) => updateBrandingText({ panelHeading: e.target.value })}
                    placeholder={t("widgetEditor.sameName")}
                    className="h-9 text-sm border-gray-200 rounded-lg"
                    data-testid="input-panel-heading"
                  />
                  {brandingErrors.panelHeading ? (
                    <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                      {t("outreachUi.markup")}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="panel-subtitle" className="text-[11px] font-semibold text-gray-600">
                    {t("widgetEditor.subtitle")}
                  </Label>
                  <Input
                    id="panel-subtitle"
                    value={settings.panelSubtitle}
                    onChange={(e) => updateBrandingText({ panelSubtitle: e.target.value })}
                    placeholder={WEBCHAT_DEFAULT_SUBTITLE}
                    className="h-9 text-sm border-gray-200 rounded-lg"
                    data-testid="input-panel-subtitle"
                  />
                  {brandingErrors.panelSubtitle ? (
                    <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                      {t("outreachUi.markup")}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="teaser-greeting" className="text-[11px] font-semibold text-gray-600">
                  {t("widgetEditor.teaserGreeting")}
                </Label>
                <Input
                  id="teaser-greeting"
                  value={settings.teaserGreeting}
                  onChange={(e) => updateBrandingText({ teaserGreeting: e.target.value })}
                  placeholder={settings.welcomeMessage || "Hi! How can we help you today?"}
                  className="h-9 text-sm border-gray-200 rounded-lg"
                  data-testid="input-teaser-greeting"
                />
                {brandingErrors.teaserGreeting ? (
                  <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                    {t("outreachUi.markup")}
                  </p>
                ) : (
                <p className="text-[10px] text-gray-500">
                  {t("widgetAdmin.ruleOverride")}
                </p>
                )}
              </div>
              <div className="space-y-1" data-testid="section-widget-logo">
                <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.logo")}</Label>
                <input
                  id={WIDGET_LOGO_FILE_INPUT_ID}
                  ref={logoFileRef}
                  type="file"
                  accept={WIDGET_LOGO_ACCEPT}
                  className="sr-only"
                  data-testid="input-logo-file"
                  onChange={onLogoFileChange}
                />
                {widgetLogoEditorHasImage(settings.logoUrl) ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <WidgetLogoFieldThumb src={coerceWidgetLogoUrl(settings.logoUrl)} />
                    <p className="text-sm text-gray-800 min-w-0 flex-1" data-testid="text-widget-logo-name">
                      {logoDisplayName}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoBusy}
                      data-testid="button-logo-replace"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openWidgetLogoFilePicker(logoFileRef.current, () => setLogoUploadError(null));
                      }}
                    >
                      {logoBusy ? t("widgetEditor.uploading") : t("widgetEditor.replace")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoBusy}
                      data-testid="button-logo-remove"
                      onClick={() => setLogoRemoveOpen(true)}
                    >
                      {t("workflowEditor.remove")}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={logoBusy}
                      data-testid="button-logo-upload"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openWidgetLogoFilePicker(logoFileRef.current, () => setLogoUploadError(null));
                      }}
                    >
                      {logoBusy ? t("widgetEditor.uploading") : t("common.upload")}
                    </Button>
                  </div>
                )}
                <AlertDialog open={logoRemoveOpen} onOpenChange={setLogoRemoveOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("widgetEditor.removeLogo")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("widgetAdmin.removeLogoHint")}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        data-testid="button-confirm-remove-logo"
                        onClick={() => {
                          setLogoUploadError(null);
                          setLogoDisplayName("Logo uploaded");
                          setLogoRemoveOpen(false);
                          updateSettings({ logoUrl: "" });
                        }}
                      >
                        {t("workflowEditor.remove")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {brandingErrors.logo || logoUploadError ? (
                  <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                    {logoUploadError || t("outreachUi.logoValidation")}
                  </p>
                ) : widgetLogoEditorHasImage(settings.logoUrl) ? null : (
                  <p className="text-[10px] text-gray-500">{t("widgetAdmin.logoTypes")}</p>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.chatIcon")}</Label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    {WEBCHAT_CHAT_ICONS.map((icon) => (
                      <button
                        type="button"
                        key={icon}
                        onClick={() => updateSettings({ chatIcon: icon })}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                          settings.chatIcon === icon ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                        )}
                        data-testid={`button-icon-${icon}`}
                      >
                        {widgetOptionLabel(t, icon)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.openBehavior")}</Label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    {WEBCHAT_OPEN_BEHAVIORS.map((behavior) => (
                      <button
                        type="button"
                        key={behavior}
                        onClick={() => updateSettings({ openBehavior: behavior })}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                          settings.openBehavior === behavior ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                        )}
                        data-testid={behavior === "teaser" ? "button-open-teaser" : "button-open-direct"}
                      >
                        {behavior === "teaser" ? t("widgetEditor.teaserFirst") : t("widgetEditor.openChat")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.corner")}</Label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    {WEBCHAT_CORNER_STYLES.map((corner) => (
                      <button
                        type="button"
                        key={corner}
                        onClick={() => updateSettings({ cornerStyle: corner })}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                          settings.cornerStyle === corner ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                        )}
                        data-testid={`button-corner-${corner}`}
                      >
                        {widgetOptionLabel(t, corner)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.panelWidth")}</Label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg">
                    {WEBCHAT_PANEL_WIDTHS.map((width) => (
                      <button
                        type="button"
                        key={width}
                        onClick={() => updateSettings({ panelWidth: width })}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-medium rounded-md capitalize transition-all",
                          settings.panelWidth === width ? "bg-white text-gray-900 shadow-sm" : "text-gray-500",
                        )}
                        data-testid={`button-width-${width}`}
                      >
                        {widgetOptionLabel(t, width)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="accent-color" className="text-[11px] font-semibold text-gray-600">
                    {t("widgetEditor.accent")}
                  </Label>
                  <div className="flex items-center gap-2">
                    <input
                      id="accent-color"
                      type="color"
                      value={sanitizeWidgetHexColor(settings.accentColor) || settings.color}
                      onChange={(e) => updateSettings({ accentColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border-2 border-gray-200 bg-white"
                      data-testid="input-accent-color"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!settings.accentColor}
                      onClick={() => updateSettings({ accentColor: "" })}
                    >
                      {t("widgetAdmin.matchColor")}
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {t("widgetAdmin.accentHint")}
                  </p>
                  {brandingErrors.color ? (
                    <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                      {brandingErrors.color === "accent" ? t("outreachUi.accentValidation") : t("outreachUi.headerValidation")}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetEditor.headerText")}</Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSettings({ headerTextColor: "auto" })}
                      className={cn(
                        "px-2 py-1.5 text-xs font-medium rounded-md border",
                        settings.headerTextColor === "auto"
                          ? "bg-white border-emerald-500 text-gray-900"
                          : "border-gray-200 text-gray-500",
                      )}
                      data-testid="button-header-auto"
                    >
                      {t("widgetEditor.autoContrast")}
                    </button>
                    <input
                      type="color"
                      value={
                        settings.headerTextColor === "auto" || !sanitizeWidgetHexColor(settings.headerTextColor)
                          ? "#ffffff"
                          : settings.headerTextColor
                      }
                      onChange={(e) => updateSettings({ headerTextColor: e.target.value })}
                      className="w-8 h-8 rounded-lg cursor-pointer border-2 border-gray-200 bg-white"
                      data-testid="input-header-text-color"
                      title={t("widgetAdmin.customHeader")}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {t("widgetAdmin.headerHint")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl" data-testid="card-widget-translations">
            <CardHeader className="px-3 py-2 sm:px-4 sm:py-2.5 pb-0">
              <CardTitle className="text-base sm:text-lg font-bold">{t("widgetEditor.visitorLanguages")}</CardTitle>
              <CardDescription className="text-[11px] sm:text-xs leading-snug">
                {t("widgetAdmin.languageHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 py-2 sm:px-4 sm:pb-3 pt-2 space-y-3">
              {(["es", "he"] as const).map((loc) => {
                const variant = settings.localized?.[loc] || {};
                const fieldProps = builderLocalizedInputProps(loc);
                return (
                  <div key={loc} className="rounded-lg border border-gray-100 p-2 space-y-2" data-testid={`widget-copy-${loc}`}>
                    <p className="text-[11px] font-semibold text-gray-500">{loc === "es" ? t("outreachUi.spanish") : t("outreachUi.hebrew")}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        {...fieldProps}
                        value={variant.panelHeading || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { panelHeading: e.target.value })}
                        placeholder={loc === "es" ? "Título del panel" : "כותרת הפאנל"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-heading-${loc}`}
                      />
                      <Input
                        {...fieldProps}
                        value={variant.panelSubtitle || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { panelSubtitle: e.target.value })}
                        placeholder={loc === "es" ? "Subtítulo" : "כותרת משנה"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-subtitle-${loc}`}
                      />
                      <Input
                        {...fieldProps}
                        value={variant.launcherLabel || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { launcherLabel: e.target.value })}
                        placeholder={loc === "es" ? "Etiqueta del botón" : "תווית הכפתור"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-launcher-${loc}`}
                      />
                      <Input
                        {...fieldProps}
                        value={variant.brandName || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { brandName: e.target.value })}
                        placeholder={loc === "es" ? "Nombre comercial (opcional)" : "שם מותג (אופציונלי)"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-brand-${loc}`}
                      />
                    </div>
                    <Input
                      {...fieldProps}
                      value={variant.welcomeMessage || ""}
                      onChange={(e) => updateLocalizedCopy(loc, { welcomeMessage: e.target.value })}
                      placeholder={loc === "es" ? "Saludo" : "ברכת פתיחה"}
                      className="h-9 text-sm border-gray-200"
                      data-testid={`input-i18n-welcome-${loc}`}
                    />
                    <Input
                      {...fieldProps}
                      value={variant.teaserGreeting || ""}
                      onChange={(e) => updateLocalizedCopy(loc, { teaserGreeting: e.target.value })}
                      placeholder={loc === "es" ? "Texto del teaser" : "טקסט הטיזר"}
                      className="h-9 text-sm border-gray-200"
                      data-testid={`input-i18n-teaser-${loc}`}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        {...fieldProps}
                        value={variant.inputPlaceholder || settings.inputPlaceholder || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { inputPlaceholder: e.target.value })}
                        placeholder={loc === "es" ? "Escribe un mensaje…" : "כתבו הודעה…"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-placeholder-${loc}`}
                      />
                      <Input
                        {...fieldProps}
                        value={variant.offlineMessage || settings.offlineMessage || ""}
                        onChange={(e) => updateLocalizedCopy(loc, { offlineMessage: e.target.value })}
                        placeholder={loc === "es" ? "Chat no disponible" : "הצ׳אט אינו זמין"}
                        className="h-9 text-sm border-gray-200"
                        data-testid={`input-i18n-offline-${loc}`}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="px-3 py-2 sm:px-4 sm:py-2.5 pb-0">
              <CardTitle className="text-base sm:text-lg font-bold">{t("widgetAdmin.appearance")}</CardTitle>
              <CardDescription className="text-[11px] sm:text-xs leading-snug">
                {t("widgetAdmin.appearanceHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 py-2 sm:px-4 sm:pb-3 pt-2 space-y-2.5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="space-y-1 min-w-0 flex-1">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetAdmin.color")}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((color) => (
                      <button
                        type="button"
                        key={color.value}
                        onClick={() => updateSettings({ color: color.value })}
                        className={cn(
                          "w-7 h-7 sm:w-8 sm:h-8 rounded-lg border-2 transition-all shrink-0",
                          settings.color === color.value
                            ? "ring-2 ring-emerald-500 ring-offset-1 border-transparent"
                            : "border-gray-200"
                        )}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                        data-testid={`color-${color.value}`}
                      />
                    ))}
                    <input
                      type="color"
                      value={settings.color}
                      onChange={(e) => updateSettings({ color: e.target.value })}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg cursor-pointer border-2 border-dashed border-gray-300 bg-white shrink-0"
                      title={t("widgetAdmin.custom")}
                      data-testid="input-custom-color"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500">
                    {t("widgetAdmin.colorHint")}
                  </p>
                </div>
                <div className="space-y-1 w-full md:w-auto md:min-w-[148px] shrink-0">
                  <Label className="text-[11px] font-semibold text-gray-600">{t("widgetAdmin.position")}</Label>
                  <div className="flex p-0.5 bg-gray-100 rounded-lg max-w-xs md:max-w-none">
                    <button
                      type="button"
                      onClick={() => updateSettings({ position: "left" })}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                        settings.position === "left" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                      )}
                      data-testid="button-position-left"
                    >
                      {t("widgetEditor.left")}
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSettings({ position: "right" })}
                      className={cn(
                        "flex-1 py-1.5 text-xs font-medium rounded-md transition-all",
                        settings.position === "right" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                      )}
                      data-testid="button-position-right"
                    >
                      {t("widgetEditor.right")}
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="welcome-message" className="text-[11px] font-semibold text-gray-600">
                  {t("widgetAdmin.defaultGreeting")}
                </Label>
                <Input
                  id="welcome-message"
                  value={settings.welcomeMessage}
                  onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
                  className="h-9 text-sm border-gray-200 rounded-lg"
                  placeholder={t("widgetAdmin.greetingExample")}
                  data-testid="input-welcome-message"
                />
                {brandingErrors.welcomeMessage ? (
                  <p className="text-[10px] text-red-600" data-testid="text-branding-error">
                    {t("outreachUi.markup")}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <CardTitle className="text-base sm:text-lg font-semibold">{t("widgetAdmin.smartEntry")}</CardTitle>
              <CardDescription className="text-xs">
                {t("widgetAdmin.smartEntryHint")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trigger-type" className="text-xs font-semibold text-gray-600">
                  {t("widgetAdmin.showWhen")}
                </Label>
                <select
                  id="trigger-type"
                  value={settings.triggerType}
                  onChange={(e) =>
                    updateSettings({ triggerType: e.target.value as WidgetTriggerType })
                  }
                  className="flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  data-testid="select-widget-trigger"
                >
                  <option value="always">{t("widgetAdmin.always")}</option>
                  <option value="delay">{t("widgetAdmin.afterDelay")}</option>
                  <option value="scroll">{t("widgetAdmin.afterScroll")}</option>
                  <option value="exit_intent">{t("widgetAdmin.exitIntent")}</option>
                </select>
              </div>

              {settings.triggerType === "delay" && (
                <div className="space-y-2">
                  <Label htmlFor="delay-sec" className="text-xs font-semibold text-gray-600">
                    {t("widgetAdmin.delaySeconds")}
                  </Label>
                  <Input
                    id="delay-sec"
                    type="number"
                    min={0}
                    max={3600}
                    value={settings.triggerDelaySeconds}
                    onChange={(e) =>
                      updateSettings({
                        triggerDelaySeconds: Math.max(0, parseInt(e.target.value, 10) || 0),
                      })
                    }
                    className="h-10 text-sm border-gray-200 rounded-lg max-w-xs"
                    data-testid="input-widget-delay"
                  />
                </div>
              )}

              {(settings.triggerType === "scroll" || settings.triggerType === "exit_intent") && (
                <div className="space-y-2">
                  <Label htmlFor="scroll-pct" className="text-xs font-semibold text-gray-600">
                    {settings.triggerType === "exit_intent"
                      ? t("widgetAdmin.depthFallback")
                      : t("widgetAdmin.depth")}
                  </Label>
                  <Input
                    id="scroll-pct"
                    type="number"
                    min={1}
                    max={100}
                    value={settings.triggerScrollPercent}
                    onChange={(e) =>
                      updateSettings({
                        triggerScrollPercent: Math.min(
                          100,
                          Math.max(1, parseInt(e.target.value, 10) || 50)
                        ),
                      })
                    }
                    className="h-10 text-sm border-gray-200 rounded-lg max-w-xs"
                    data-testid="input-widget-scroll"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Monitor className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-800">{t("widgetSettingsUi.desktop")}</span>
                  </div>
                  <Switch
                    checked={settings.showOnDesktop}
                    onCheckedChange={(showOnDesktop) => updateSettings({ showOnDesktop })}
                    data-testid="switch-show-desktop"
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-800">{t("widgetSettingsUi.mobile")}</span>
                  </div>
                  <Switch
                    checked={settings.showOnMobile}
                    onCheckedChange={(showOnMobile) => updateSettings({ showOnMobile })}
                    data-testid="switch-show-mobile"
                    className="data-[state=checked]:bg-emerald-500"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-gray-200 shadow-sm overflow-hidden rounded-xl">
            <CardHeader className="p-3 sm:p-4 pb-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <CardTitle className="text-base sm:text-lg font-semibold">{t("widgetAdmin.rules")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("widgetAdmin.rulesHint")}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                  <span
                    className="text-[11px] text-gray-500"
                    data-testid="text-page-rules-save-status"
                  >
                    {pageRulesSaveStatus}
                  </span>
                  {saveMutation.isError ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => persistWidgetSettings(settingsRef.current)}
                      data-testid="button-page-rules-save-retry"
                    >
                      {t("common.tryAgain")}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" size="sm" onClick={addPageRule} className="shrink-0">
                    <Plus className="me-1.5 h-3.5 w-3.5" />
                    {t("widgetAdmin.addRule")}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-4">
              {showLeftoverLegacyRules && (
                <div
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-2"
                  data-testid="recommend-clear-legacy-rules"
                >
                  <p>
                    {t("outreachUi.exampleRules")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => updateSettings({ pageRules: [] })}
                    data-testid="button-clear-legacy-example-rules"
                  >
                    {t("widgetAdmin.removeExamples")}
                  </Button>
                </div>
              )}
              {settings.pageRules.length === 0 ? (
                <p className="text-sm text-gray-500" data-testid="empty-page-rules">
                  {t("widgetAdmin.noRules")}
                </p>
              ) : null}
              {settings.pageRules.map((rule, index) => (
                <div
                  key={rule.id}
                  className="rounded-xl border border-gray-100 bg-gray-50/50 p-3 space-y-3 overflow-x-hidden min-w-0"
                  data-testid={`page-rule-${index}`}
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-700">{t("widgetAdmin.rule")} {index + 1}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-gray-500 hover:text-red-600"
                      onClick={() => removePageRule(index)}
                      aria-label={t("outreachUi.removeRule")} data-testid={`button-remove-rule-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 min-w-0">
                    <div className="space-y-2 min-w-0">
                      <Label className="text-xs text-gray-600">{rule.matchType === "pathname" ? t("outreachUi.primaryPath") : rule.matchType === "pathname_prefix" ? t("widgetAdmin.prefix") : t("outreachUi.urlContains")}</Label>
                      <Input
                        dir="ltr"
                        value={rule.urlContains}
                        onChange={(e) => updatePageRule(index, { urlContains: e.target.value })}
                        placeholder={
                          rule.matchType === "pathname"
                            ? "/pricing"
                            : rule.matchType === "pathname_prefix"
                              ? "/blog"
                              : "/about or ?campaign=spring"
                        }
                        className="h-9 text-sm border-gray-200 bg-white min-w-0"
                        data-testid={`input-rule-url-${index}`}
                      />
                      {pageRulePathInputIssue(rule.urlContains) ? (
                        <p className="text-xs text-red-600" data-testid={`error-rule-url-${index}`}>
                          {t("outreachUi.separatePaths")}
                        </p>
                      ) : null}
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label className="text-xs text-gray-600">{t("widgetAdmin.match")}</Label>
                      <select
                        value={rule.matchType || "contains"}
                        onChange={(e) =>
                          changePageRuleMatchType(index, e.target.value as WidgetPageRule["matchType"])
                        }
                        className="h-9 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2 text-sm"
                        data-testid={`select-rule-match-${index}`}
                      >
                        <option value="contains">{t("widgetAdmin.contains")}</option>
                        <option value="pathname">{t("widgetAdmin.exact")}</option>
                        <option value="pathname_prefix">{t("widgetAdmin.prefix")}</option>
                      </select>
                      {rule.matchType !== "pathname" ? (
                        <p className="text-[11px] text-gray-500" data-testid={`text-aliases-exact-only-${index}`}>
                          {t("widgetAdmin.exactOnly")}
                        </p>
                      ) : null}
                      {clearedAliasNoticeIds.has(rule.id) ? (
                        <p className="text-[11px] text-amber-800" data-testid={`text-aliases-cleared-${index}`}>
                          {t("widgetAdmin.aliasesCleared")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {rule.matchType === "pathname" ? (
                    <div className="space-y-2 min-w-0" data-testid={`section-rule-aliases-${index}`}>
                      <Label className="text-xs text-gray-600">{t("widgetAdmin.aliases")}</Label>
                      <p className="text-[11px] text-gray-500">
                        {t("widgetAdmin.aliasesHint")}
                      </p>
                      {(rule.urlAliases || []).map((alias, aliasIndex) => (
                        <div key={`${rule.id}-alias-${aliasIndex}`} className="flex items-center gap-2 min-w-0">
                          <Input
                            dir="ltr"
                            value={alias}
                            onChange={(e) => {
                              const nextAliases = [...(rule.urlAliases || [])];
                              nextAliases[aliasIndex] = e.target.value;
                              updatePageRule(index, { urlAliases: nextAliases });
                            }}
                            placeholder="/es/pricing"
                            className="h-9 min-w-0 flex-1 text-sm border-gray-200 bg-white"
                            data-testid={`input-rule-alias-${index}-${aliasIndex}`}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 shrink-0 text-gray-500 hover:text-red-600"
                            onClick={() =>
                              updatePageRule(index, {
                                urlAliases: (rule.urlAliases || []).filter((_, i) => i !== aliasIndex),
                              })
                            }
                            aria-label={t("outreachUi.removePath")} data-testid={`button-remove-alias-${index}-${aliasIndex}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      {(rule.urlAliases || []).map((alias, aliasIndex) =>
                        pageRulePathInputIssue(alias) ? (
                          <p
                            key={`${rule.id}-alias-error-${aliasIndex}`}
                            className="text-xs text-red-600"
                            data-testid={`error-rule-alias-${index}-${aliasIndex}`}
                          >
                            {t("outreachUi.separatePaths")}
                          </p>
                        ) : null,
                      )}
                      {(rule.urlAliases || []).length < WIDGET_PAGE_RULE_MAX_ALIASES ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updatePageRule(index, { urlAliases: [...(rule.urlAliases || []), ""] })
                          }
                          data-testid={`button-add-alias-${index}`}
                        >
                          <Plus className="me-1.5 h-3.5 w-3.5" />
                          {t("widgetAdmin.addPath")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">{t("widgetAdmin.greeting")}</Label>
                    <Input
                      value={rule.greeting}
                      onChange={(e) => updatePageRule(index, { greeting: e.target.value })}
                      placeholder={t("widgetAdmin.fullGreeting")}
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-greeting-${index}`}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        {...builderLocalizedInputProps("es")}
                        value={rule.localized?.es?.greeting || ""}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              es: { ...(rule.localized?.es || {}), greeting: e.target.value },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.spanishGreeting")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-greeting-es-${index}`}
                      />
                      <Input
                        {...builderLocalizedInputProps("he")}
                        value={rule.localized?.he?.greeting || ""}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              he: { ...(rule.localized?.he || {}), greeting: e.target.value },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.hebrewGreeting")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-greeting-he-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">{t("widgetAdmin.teaser")}</Label>
                    <Input
                      value={rule.teaserGreeting || ""}
                      onChange={(e) => updatePageRule(index, { teaserGreeting: e.target.value })}
                      placeholder={t("widgetAdmin.teaserHint")}
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-teaser-${index}`}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        {...builderLocalizedInputProps("es")}
                        value={rule.localized?.es?.teaserGreeting || ""}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              es: { ...(rule.localized?.es || {}), teaserGreeting: e.target.value },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.spanishTeaser")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-teaser-es-${index}`}
                      />
                      <Input
                        {...builderLocalizedInputProps("he")}
                        value={rule.localized?.he?.teaserGreeting || ""}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              he: { ...(rule.localized?.he || {}), teaserGreeting: e.target.value },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.hebrewTeaser")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-teaser-he-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">{t("widgetAdmin.prefill")}</Label>
                    <Textarea
                      value={rule.prefilledMessage}
                      onChange={(e) => updatePageRule(index, { prefilledMessage: e.target.value })}
                      placeholder={t("widgetAdmin.prefillHint")}
                      rows={2}
                      className="text-sm border-gray-200 bg-white resize-y min-h-[60px]"
                      data-testid={`input-rule-prefill-${index}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">{t("widgetAdmin.questions")}</Label>
                    <Input
                      value={(rule.suggestedQuestions || []).join(", ")}
                      onChange={(e) =>
                        updatePageRule(index, {
                          suggestedQuestions: e.target.value
                            .split(",")
                            .map((q) => q.trim())
                            .filter(Boolean)
                            .slice(0, 8),
                        })
                      }
                      placeholder={t("widgetAdmin.questionsHint")}
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-questions-${index}`}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        {...builderLocalizedInputProps("es")}
                        value={(rule.localized?.es?.suggestedQuestions || []).join(", ")}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              es: {
                                ...(rule.localized?.es || {}),
                                suggestedQuestions: e.target.value
                                  .split(",")
                                  .map((q) => q.trim())
                                  .filter(Boolean)
                                  .slice(0, 8),
                              },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.spanishQuestions")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-questions-es-${index}`}
                      />
                      <Input
                        {...builderLocalizedInputProps("he")}
                        value={(rule.localized?.he?.suggestedQuestions || []).join(", ")}
                        onChange={(e) =>
                          updatePageRule(index, {
                            localized: {
                              ...(rule.localized || {}),
                              he: {
                                ...(rule.localized?.he || {}),
                                suggestedQuestions: e.target.value
                                  .split(",")
                                  .map((q) => q.trim())
                                  .filter(Boolean)
                                  .slice(0, 8),
                              },
                            },
                          })
                        }
                        placeholder={t("widgetAdmin.hebrewQuestions")}
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-questions-he-${index}`}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">{t("widgetAdmin.flow")}</Label>
                      <select
                        value={rule.chatbotFlowId || ""}
                        onChange={(e) => updatePageRule(index, { chatbotFlowId: e.target.value })}
                        className="h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                        data-testid={`select-rule-flow-${index}`}
                      >
                        <option value="">{t("widgetAdmin.defaultFlow")}</option>
                        {(chatbotFlows || [])
                          .filter((f) => f.isActive !== false)
                          .map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-600">{t("widgetAdmin.ctaLabel")}</Label>
                      <Input
                        value={rule.ctaLabel || ""}
                        onChange={(e) => updatePageRule(index, { ctaLabel: e.target.value })}
                        placeholder="Optional"
                        className="h-9 text-sm border-gray-200 bg-white"
                        data-testid={`input-rule-cta-label-${index}`}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-600">{t("widgetAdmin.ctaUrl")}</Label>
                    <Input
                      value={rule.ctaUrl || ""}
                      onChange={(e) => updatePageRule(index, { ctaUrl: e.target.value })}
                      placeholder="https://example.com/contact (optional)"
                      className="h-9 text-sm border-gray-200 bg-white"
                      data-testid={`input-rule-cta-url-${index}`}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border border-slate-200 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">{t("widgetAdmin.install")}</CardTitle>
              <CardDescription>{t("widgetAdmin.installLead")}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t("widgetAdmin.publicId")}</h3>
                    <p className="text-xs text-slate-500">
                      {t("widgetAdmin.publicIdHint")}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" data-testid="button-rotate-widget-id">
                        {t("widgetAdmin.rotate")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("widgetAdmin.rotateTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("widgetAdmin.rotateHint")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          data-testid="button-confirm-rotate-widget-id"
                          onClick={async () => {
                            const res = await fetch("/api/widget-settings/rotate-id", {
                              method: "POST",
                              credentials: "include",
                            });
                            if (res.ok) {
                              didHydrateFromWidgetQuery.current = false;
                              queryClient.invalidateQueries({ queryKey: ["/api/widget-settings"] });
                            }
                          }}
                        >
                          {t("widgetAdmin.rotate")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <code className="block text-xs font-mono bg-slate-50 rounded p-2 break-all" data-testid="text-widget-public-id">
                  {widgetPublicId || t("common.loading")}
                </code>
                <div className="space-y-1" id="widget-origins" ref={originsSectionRef}>
                  <Label className="text-xs text-gray-600">{t("widgetAdmin.origins")}</Label>
                  <p className="text-[11px] text-slate-500">
                    {t("widgetAdmin.originsHint")}
                  </p>
                  <Textarea
                    value={(settings.allowedOrigins || []).join("\n")}
                    onChange={(e) => {
                      const allowedOrigins = e.target.value
                        .split("\n")
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .slice(0, 50);
                      updateSettings({
                        allowedOrigins,
                        ...(allowedOrigins.length === 0 && settings.allowAnyOrigin !== true
                          ? { enabled: false }
                          : {}),
                      });
                    }}
                    placeholder="https://www.example.com"
                    rows={2}
                    className="text-xs font-mono"
                    data-testid="input-allowed-origins"
                  />
                  <label className="flex items-start gap-2 text-xs text-slate-700 pt-1">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={settings.allowAnyOrigin === true}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const ok = window.confirm(
                            "Allow this widget on any website? Anyone with the public widget ID can embed it. This is never turned on automatically.",
                          );
                          if (!ok) return;
                        }
                        updateSettings({ allowAnyOrigin: e.target.checked });
                      }}
                      data-testid="checkbox-allow-any-origin"
                    />
                    <span>
                      {t("widgetAdmin.anySite")}
                    </span>
                  </label>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2" data-testid="section-webchat-ai-mode">
                <h3 className="text-sm font-semibold text-slate-900">{t("widgetAdmin.aiReplies")}</h3>
                <ul className="text-xs text-slate-600 space-y-1 list-disc ps-4">
                  <li>{t("widgetAdmin.manual")}</li>
                  <li>{t("widgetAdmin.suggest")}</li>
                  <li>{t("widgetAdmin.auto")}</li>
                </ul>
                <p className="text-xs text-slate-500">
                  {subscription?.limits?.effectiveHasAIBrain ? t("outreachUi.autoEligible") : t("outreachUi.autoIneligible")}{" "}
                  {t("outreachUi.autoHint")}
                  {aiSettings?.aiMode && <span className="ms-1">({aiSettings.aiMode === "auto" ? t("aiBrain.autoReply") : aiSettings.aiMode === "suggest" ? t("aiBrain.suggestOnly") : aiSettings.aiMode === "manual" ? t("aiBrain.off") : aiSettings.aiMode})</span>}
                </p>
                {savedSettings?.webchatServerAi &&
                  savedSettings.webchatServerAi.unattendedEligible !== true && (
                  <p className="text-xs text-amber-800" data-testid="text-auto-rollout-off">
                    {t("widgetAdmin.autoPaused")}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900">
                      JavaScript <span className="text-xs font-medium text-slate-500">{t("widgetAdmin.recommended")}</span>
                    </h3>
                    <p className="text-sm text-slate-500">
                      {t("outreachUi.copyBeforeBody")}
                    </p>
                  </div>

                  <Button
                    size="sm"
                    className="shrink-0"
                    onClick={copyScript}
                    disabled={!scriptCode}
                    data-testid="button-copy-embed"
                  >
                    {copiedType === "script" ? (
                      <>
                        <Check className="me-1.5 h-3.5 w-3.5 text-emerald-600" />
                        {t("widgetAdmin.copied")}
                      </>
                    ) : (
                      <>
                        <Copy className="me-1.5 h-3.5 w-3.5" />
                        {t("widgetAdmin.copyScript")}
                      </>
                    )}
                  </Button>
                </div>

                <pre dir="ltr" className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                  <code>{scriptCode || t("common.loading")}</code>
                </pre>

                <p className="text-xs text-slate-500">
                  {t("widgetAdmin.installPlatforms")}
                </p>
              </div>

              <Accordion type="single" collapsible className="rounded-xl border border-slate-200 px-4">
                <AccordionItem value="advanced" className="border-none">
                  <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                    {t("widgetAdmin.advanced")}
                  </AccordionTrigger>

                  <AccordionContent className="space-y-3 pb-4">
                    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-slate-900">iFrame</h4>
                          <p className="text-xs text-slate-500">
                            {t("widgetAdmin.iframeHint")}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-slate-200"
                          onClick={copyIframe}
                          disabled={!iframeFloatingCode}
                          data-testid="button-copy-iframe-floating"
                        >
                          {copiedType === "iframe" ? (
                            <>
                              <Check className="me-1.5 h-3.5 w-3.5 text-emerald-600" />
                              {t("widgetAdmin.copied")}
                            </>
                          ) : (
                            <>
                              <Copy className="me-1.5 h-3.5 w-3.5" />
                              {t("widgetAdmin.copyFrame")}
                            </>
                          )}
                        </Button>
                      </div>

                      <pre dir="ltr" className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                        <code>{iframeFloatingCode || t("common.loading")}</code>
                      </pre>

                      <p className="text-xs text-slate-500">
                        {t("widgetAdmin.preferScript")}
                      </p>

                      <div className="border-t border-slate-100 pt-3 space-y-2">
                        <p className="text-xs font-medium text-slate-800">
                          {t("outreachUi.iframeParent")}
                        </p>
                        <p className="text-xs text-slate-500">
                          {t("outreachUi.iframeParentHint")}
                        </p>
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 border-slate-200"
                            onClick={copyIframeWithParentScript}
                            disabled={!iframeWithParentScript}
                            data-testid="button-copy-iframe-parent-url"
                          >
                            {copiedType === "iframeParent" ? (
                              <>
                                <Check className="me-1.5 h-3.5 w-3.5 text-emerald-600" />
                                {t("widgetAdmin.copied")}
                              </>
                            ) : (
                              <>
                                <Copy className="me-1.5 h-3.5 w-3.5" />
                                {t("widgetAdmin.copySnippet")}
                              </>
                            )}
                          </Button>
                        </div>
                        <pre dir="ltr" className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
                          <code>{iframeWithParentScript || t("common.loading")}</code>
                        </pre>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h4 className="text-sm font-medium text-slate-900">{t("widgetAdmin.hosted")}</h4>
                          <p className="text-xs text-slate-500">
                            {t("widgetAdmin.hostedHint")}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-slate-200"
                          onClick={copyHostedLink}
                          disabled={!hostedLinkUrl}
                          data-testid="button-copy-hosted"
                        >
                          {copiedType === "hosted" ? (
                            <>
                              <Check className="me-1.5 h-3.5 w-3.5 text-emerald-600" />
                              {t("widgetAdmin.copied")}
                            </>
                          ) : (
                            <>
                              <Copy className="me-1.5 h-3.5 w-3.5" />
                              {t("widgetAdmin.copyLink")}
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="lead-source" className="text-xs text-slate-600">
                          {t("widgetAdmin.leadSource")}
                        </Label>
                        <Input
                          id="lead-source"
                          value={leadSource}
                          onChange={(e) => setLeadSource(e.target.value)}
                          placeholder="e.g. website, instagram, googleads"
                          className="h-9 max-w-md border-slate-200 text-sm"
                          data-testid="input-lead-source"
                        />
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-amber-900">Tip</p>
              <p className="text-[10px] sm:text-xs text-amber-800/80">
                {t("widgetAdmin.incognito")}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
