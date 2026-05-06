import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Smartphone,
  Globe,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  Settings2,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Clock,
  ChevronDown,
  ChevronRight,
  Zap,
  Webhook,
  ArrowLeft,
  ExternalLink,
  FlaskConical,
} from "lucide-react";
import { ConnectMetaWizard } from "@/components/ConnectMetaWizard";
import { ConnectWhatsAppHub } from "@/components/ConnectWhatsAppHub";
import { ConnectTwilioWizard } from "@/components/ConnectTwilioWizard";
import { ConnectMetaFbIgWizard } from "@/components/ConnectMetaFbIgWizard";
import type { SettingsChannelProvider } from "@/lib/settingsChannelsNavigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'sms' | 'webchat' | 'telegram' | 'tiktok';

type ChannelWithBrandLogo = Exclude<Channel, 'webchat'>;

const CHANNEL_BRAND: Record<
  ChannelWithBrandLogo,
  { logoSrc: string; logoBgClass: string; label: string }
> = {
  whatsapp: { logoSrc: '/logos/whatsapp.svg', logoBgClass: 'bg-[#25D366]', label: 'WhatsApp' },
  instagram: { logoSrc: '/logos/instagram.svg', logoBgClass: 'bg-[#FF0069]', label: 'Instagram' },
  facebook: { logoSrc: '/logos/facebook.svg', logoBgClass: 'bg-[#0866FF]', label: 'Facebook Messenger' },
  sms: { logoSrc: '/logos/sms.svg', logoBgClass: 'bg-gray-100', label: 'SMS' },
  telegram: { logoSrc: '/logos/telegram.svg', logoBgClass: 'bg-[#26A5E4]', label: 'Telegram' },
  tiktok: { logoSrc: '/logos/tiktok.svg', logoBgClass: 'bg-black', label: 'TikTok' },
};

function ChannelBrandIcon({
  channel,
  className,
}: {
  channel: ChannelWithBrandLogo;
  className?: string;
}) {
  const b = CHANNEL_BRAND[channel];
  /** Simple Icons paths are dark; invert on saturated brand tiles (SMS stays dark on gray). */
  const lightGlyph =
    channel === 'whatsapp' ||
    channel === 'instagram' ||
    channel === 'facebook' ||
    channel === 'telegram' ||
    channel === 'tiktok';
  return (
    <div
      className={cn(
        'w-10 h-10 flex items-center justify-center rounded-lg flex-shrink-0',
        b.logoBgClass,
        className
      )}
    >
      <img
        src={b.logoSrc}
        alt={b.label}
        className={cn('w-6 h-6 object-contain', lightGlyph && 'brightness-0 invert')}
      />
    </div>
  );
}

interface ChannelSetting {
  id: string;
  channel: string;
  isEnabled: boolean | null;
  isConnected: boolean | null;
  config: any;
  fallbackEnabled: boolean | null;
  fallbackPriority: number | null;
}

interface Integration {
  id: string;
  type: string;
  name: string;
  isActive: boolean;
  config: any;
}

const CHANNEL_CONFIG: Record<Channel, {
  color: string;
  label: string;
  description: string;
  isMessaging: boolean;
}> = {
  whatsapp: {
    color: '#25D366',
    label: 'WhatsApp',
    description: 'Primary messaging channel',
    isMessaging: true,
  },
  instagram: {
    color: '#FF0069',
    label: 'Instagram',
    description: 'Direct messages via Meta Graph API',
    isMessaging: true,
  },
  facebook: {
    color: '#0866FF',
    label: 'Facebook Messenger',
    description: 'Messages via Meta Graph API',
    isMessaging: true,
  },
  sms: {
    color: '#6B7280',
    label: 'SMS',
    description: 'Text messages via Twilio',
    isMessaging: true,
  },
  webchat: {
    color: '#3B82F6',
    label: 'Web Chat',
    description: 'Embed a chat widget on your website',
    isMessaging: true,
  },
  telegram: {
    color: '#26A5E4',
    label: 'Telegram',
    description: 'Connect your Telegram bot',
    isMessaging: true,
  },
  tiktok: {
    color: '#000000',
    label: 'TikTok',
    description: 'Lead intake only (not messaging)',
    isMessaging: false,
  },
};

export function ChannelSettings() {
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const [configChannel, setConfigChannel] = useState<Channel | null>(null);
  const [whatsappEmbeddedInlineError, setWhatsappEmbeddedInlineError] = useState<string | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramStep, setTelegramStep] = useState<1 | 2 | 3>(1);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramConnectResult, setTelegramConnectResult] = useState<{ username: string; botLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [tiktokMode, setTiktokMode] = useState<'select' | 'zapier' | 'webhook'>('select');
  const [tiktokWebhookExpanded, setTiktokWebhookExpanded] = useState(false);
  const [tiktokCopied, setTiktokCopied] = useState(false);
  const [tiktokTestLeadSent, setTiktokTestLeadSent] = useState(false);
  const [connectMetaOpen, setConnectMetaOpen] = useState(false);
  const [connectTwilioOpen, setConnectTwilioOpen] = useState(false);
  const [connectFbIgConfig, setConnectFbIgConfig] = useState<{
    channel: 'facebook' | 'instagram';
    initialStage?: 'idle' | 'page_select';
  } | null>(null);
  const [manageFbIgChannel, setManageFbIgChannel] = useState<'facebook' | 'instagram' | null>(null);
  const [showManageToken, setShowManageToken] = useState(false);
  const [resubscribeResult, setResubscribeResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manageCopiedUrl, setManageCopiedUrl] = useState(false);
  const [manageCopiedToken, setManageCopiedToken] = useState(false);

  // Detect OAuth callback: ?meta_oauth=ready&channel=facebook|instagram
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get("meta_oauth");
    const oauthChannel = params.get("channel") as 'facebook' | 'instagram' | null;

    if (!oauthStatus) return;

    // Strip OAuth params from URL without triggering a navigation
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);

    if (oauthStatus === "ready" && (oauthChannel === "facebook" || oauthChannel === "instagram")) {
      // Open the wizard in page_select stage — pages are stored in server session
      setConnectFbIgConfig({ channel: oauthChannel, initialStage: "page_select" });
    } else if (oauthStatus === "denied") {
      toast({
        title: "Permission denied",
        description: "Facebook access was not granted. You can try again at any time.",
        variant: "destructive",
      });
    } else if (oauthStatus === "error") {
      const reason = params.get("reason") || "unknown error";
      toast({
        title: "Connection failed",
        description: `Something went wrong during the Facebook login (${reason}). Please try again.`,
        variant: "destructive",
      });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Deep link: ?section=channels&provider=whatsapp|instagram|facebook (legacy: tab=channels) */
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const sectionOk =
      params.get("section") === "channels" || params.get("tab") === "channels";
    if (!sectionOk) return;
    const raw = params.get("provider");
    if (raw !== "whatsapp" && raw !== "instagram" && raw !== "facebook") return;
    const provider = raw as SettingsChannelProvider;
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`channel-card-${provider}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("ring-2", "ring-brand-green/90", "ring-offset-2", "rounded-lg");
      window.setTimeout(() => {
        el?.classList.remove("ring-2", "ring-brand-green/90", "ring-offset-2", "rounded-lg");
      }, 2600);
    }, 450);
    return () => clearTimeout(scrollTimer);
  }, [searchString]);

  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const embedded = params.get("whatsapp_embedded");
    if (embedded === "success") {
      void (async () => {
        await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
        let metaReady = false;
        for (let attempt = 0; attempt < 14; attempt++) {
          const res = await fetch("/api/integrations/whatsapp/status", { credentials: "include" });
          if (res.ok) {
            const s = await res.json();
            if (
              s.activeProvider === "meta" &&
              s.meta?.connected &&
              (s.meta?.businessAccountId || s.meta?.phoneNumberId)
            ) {
              metaReady = true;
              break;
            }
          }
          await new Promise((r) => setTimeout(r, 450));
        }
        await queryClient.refetchQueries({ queryKey: ["/api/integrations/whatsapp/status"] });
        await queryClient.refetchQueries({ queryKey: ["/api/channels"] });
        if (metaReady) {
          toast({
            title: "WhatsApp connected",
            description: "Meta Cloud API is active and saved. You can send and receive from the inbox.",
          });
        } else {
          toast({
            title: "Could not confirm Meta Cloud API yet",
            description:
              "OAuth finished, but the server did not report Meta as the active provider with saved IDs. Open WhatsApp settings and check diagnostics, or refresh and try again.",
            variant: "destructive",
          });
        }
      })();
      params.delete("whatsapp_embedded");
      params.delete("reason");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    } else if (embedded === "error") {
      const reason = params.get("reason") || "Meta signup did not complete.";
      // Show inline (non-destructive) messaging inside the WhatsApp connect dialog.
      setWhatsappEmbeddedInlineError(
        "Couldn’t find a WhatsApp phone number on the selected business. Please select the WABA that has your number or add a phone number in Meta."
      );
      setConfigChannel("whatsapp");
      params.delete("whatsapp_embedded");
      params.delete("reason");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    } else if (embedded === "pick") {
      // Multiple valid WABAs detected server-side; open the connect dialog so user can choose.
      setConfigChannel("whatsapp");
      params.delete("whatsapp_embedded");
      const q = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
    }
  }, [searchString, queryClient]);

  const { data: channels = [], isLoading } = useQuery<ChannelSetting[]>({
    queryKey: ["/api/channels"],
  });

  // TikTok: derived active state — must live AFTER channels is declared
  const isTiktokChannelActive = !!(channels.find(c => c.channel === 'tiktok')?.isConnected && channels.find(c => c.channel === 'tiktok')?.isEnabled);
  const isTiktokSetupMode = configChannel === 'tiktok' && (tiktokMode === 'zapier' || tiktokMode === 'webhook');

  // Poll channels every 4s while the user is on the Zapier or webhook setup screen
  useEffect(() => {
    if (!isTiktokSetupMode) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
    }, 4000);
    return () => clearInterval(id);
  }, [isTiktokSetupMode, queryClient]);

  // Auto-transition to active view once the channel becomes active
  useEffect(() => {
    if (isTiktokSetupMode && isTiktokChannelActive) {
      setTiktokMode('select');
    }
  }, [isTiktokSetupMode, isTiktokChannelActive]);

  const { data: user } = useQuery<{
    id: string;
    twilioConnected?: boolean;
    metaConnected?: boolean;
    whatsappProvider?: string;
  }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: waIntegrationStatus } = useQuery<{
    activeProvider: string;
    whatsappConnectedReason: "twilio" | "meta" | "none";
    metaPersistedButTwilioSelected?: boolean;
    meta: {
      connected: boolean;
      phoneNumberId: string | null;
      businessAccountId: string | null;
      integrationStatus?: string;
    };
  }>({
    queryKey: ["/api/integrations/whatsapp/status"],
    staleTime: 15_000,
  });

  const { data: integrations = [] } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
  });

  const { data: metaWebhookConfig } = useQuery<{
    webhookUrl: string;
    facebook: { isConnected: boolean; verifyToken: string; pageName?: string | null; pageId?: string | null };
    instagram: { isConnected: boolean; verifyToken: string; pageName?: string | null; pageId?: string | null };
  }>({
    queryKey: ["/api/integrations/meta-webhook-config"],
  });

  const updateChannelMutation = useMutation({
    mutationFn: async ({ channel, data }: { channel: Channel; data: any }) => {
      const res = await fetch(`/api/channels/${channel}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update channel");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Channel updated" });
    },
  });

  const switchProviderMutation = useMutation({
    mutationFn: async (provider: 'twilio' | 'meta') => {
      const res = await fetch("/api/user/whatsapp-provider", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider }),
      });
      if (!res.ok) throw new Error("Failed to switch provider");
      return res.json();
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: `Switched to ${provider === 'meta' ? 'Meta' : 'Twilio'} WhatsApp` });
      setConfigChannel(null);
    },
  });

  const disconnectFbIgMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const res = await fetch(`/api/integrations/${integrationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/meta-webhook-config"] });
      setManageFbIgChannel(null);
      toast({ title: "Channel disconnected" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect. Please try again.", variant: "destructive" });
    },
  });

  const resubscribeMutation = useMutation({
    mutationFn: async (channel: "facebook" | "instagram") => {
      console.info("[Integrations] Refresh Webhook Subscription — request", { channel });
      let res: Response;
      try {
        res = await fetch("/api/integrations/meta/resubscribe", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel }),
        });
      } catch (networkErr: unknown) {
        const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
        console.error("[Integrations] meta/resubscribe network error", { channel, message: msg });
        throw new Error(`Network error: ${msg}`);
      }

      const raw = await res.text();
      let data: { error?: string; resubscribed?: boolean; message?: string } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        console.error("[Integrations] meta/resubscribe non-JSON response", {
          channel,
          status: res.status,
          snippet: raw.slice(0, 200),
        });
        throw new Error(`Invalid response (${res.status}). Is the API reachable?`);
      }

      if (!res.ok) {
        console.error("[Integrations] meta/resubscribe HTTP error", {
          channel,
          status: res.status,
          error: data.error,
        });
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      console.info("[Integrations] meta/resubscribe OK", {
        channel,
        resubscribed: data.resubscribed,
      });
      return data;
    },
    onSuccess: (data) => {
      setResubscribeResult({ success: !!data.resubscribed, message: data.message || "" });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to refresh webhook subscription.";
      console.error("[Integrations] meta/resubscribe mutation error", message);
      setResubscribeResult({ success: false, message });
    },
  });

  const getChannelStatus = (channel: Channel): 'connected' | 'pending' | 'disconnected' => {
    const setting = channels.find(c => c.channel === channel);

    if (channel === 'whatsapp') {
      if (user?.whatsappProvider === 'meta' && user?.metaConnected) return 'connected';
      if (user?.twilioConnected) return 'connected';
      return 'disconnected';
    }

    if (channel === 'sms') {
      return user?.twilioConnected ? 'connected' : 'disconnected';
    }

    // For Facebook/Instagram: credentials may be saved (integration exists) but
    // webhook not yet confirmed — show a "pending" state.
    if (channel === 'facebook' || channel === 'instagram') {
      if (setting?.isConnected) return 'connected';
      const integrationType = channel === 'facebook' ? 'meta_facebook' : 'meta_instagram';
      const hasIntegration = integrations.some(i => i.type === integrationType);
      if (hasIntegration) return 'pending';
      return 'disconnected';
    }

    return setting?.isConnected ? 'connected' : 'disconnected';
  };

  const isChannelEnabled = (channel: Channel) => {
    const setting = channels.find(c => c.channel === channel);
    return setting?.isEnabled ?? false;
  };

  const toggleChannel = (channel: Channel, enabled: boolean) => {
    updateChannelMutation.mutate({ channel, data: { isEnabled: enabled } });
  };

  const connectTelegramMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await fetch("/api/integrations/telegram/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ botToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Connection failed");
      return data as { username: string; firstName: string; botLink: string };
    },
    onSuccess: (data) => {
      setTelegramConnectResult({ username: data.username, botLink: data.botLink });
      setTelegramError(null);
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: `Connected as @${data.username}` });
    },
    onError: (err: Error) => {
      setTelegramError(err.message);
    },
  });

  const resetTelegramDialog = () => {
    setTelegramStep(1);
    setTelegramToken("");
    setTelegramError(null);
    setTelegramConnectResult(null);
  };

  const sendTestLeadMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/tiktok/test-lead", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send test lead");
      return res.json();
    },
    onSuccess: () => {
      setTiktokTestLeadSent(true);
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Test lead sent!", description: "Check your inbox — a new TikTok lead just arrived." });
    },
    onError: (err: Error) => {
      toast({ title: "Couldn't send test lead", description: err.message, variant: "destructive" });
    },
  });

  const resetTiktokDialog = () => {
    setTiktokMode('select');
    setTiktokWebhookExpanded(false);
    setTiktokCopied(false);
    setTiktokTestLeadSent(false);
  };

  const copyText = (text: string, setFn: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setFn(true);
    setTimeout(() => setFn(false), 2000);
  };

  const copyWebhookUrl = (url: string) => copyText(url, setCopied);
  const webhookBaseUrl = window.location.origin;

  const handleFbIgConnectClick = (channel: 'facebook' | 'instagram') => {
    setConnectFbIgConfig({ channel, initialStage: 'idle' });
  };

  const handleFbIgSettingsClick = (channel: 'facebook' | 'instagram') => {
    setShowManageToken(false);
    setManageCopiedUrl(false);
    setManageCopiedToken(false);
    setManageFbIgChannel(channel);
  };

  const manageChannelData = manageFbIgChannel === 'facebook'
    ? metaWebhookConfig?.facebook
    : metaWebhookConfig?.instagram;

  const manageIntegration = integrations.find(
    i => i.type === (manageFbIgChannel === 'facebook' ? 'meta_facebook' : 'meta_instagram')
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="h-9 w-9 sm:h-10 sm:w-10 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
          <MessageCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base sm:text-lg font-bold text-gray-900">Communication Channels</h2>
          <p className="text-xs sm:text-sm text-gray-500">Connect your messaging platforms.</p>
        </div>
      </div>

      <div className="space-y-3">
        {(Object.keys(CHANNEL_CONFIG) as Channel[])
          .filter(channel => channel !== 'webchat')
          .map((channel) => {
            const config = CHANNEL_CONFIG[channel];
            const status = getChannelStatus(channel);
            const enabled = isChannelEnabled(channel);
            const isFbIg = channel === 'facebook' || channel === 'instagram';
            // Resolved page/account name stored during wizard validation
            const channelSetting = channels.find(s => s.channel === channel);
            const savedPageName = channelSetting?.config?.pageName as string | undefined;
            const savedPageId = channelSetting?.config?.pageId as string | undefined;

            return (
              <div
                key={channel}
                id={`channel-card-${channel}`}
                className={cn(
                  "flex items-center justify-between p-3 sm:p-4 rounded-lg border transition-colors",
                  status === 'connected'
                    ? "bg-gray-50 border-gray-200"
                    : status === 'pending'
                    ? "bg-amber-50/60 border-amber-200"
                    : "bg-gray-50/50 border-gray-100"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <ChannelBrandIcon channel={channel as ChannelWithBrandLogo} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{config.label}</span>
                      {status === 'connected' ? (
                        isFbIg ? (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Ready to receive messages
                          </span>
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )
                      ) : status === 'pending' ? (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                          <Clock className="h-2.5 w-2.5" />
                          Webhook pending
                        </span>
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-gray-300" />
                      )}
                      {!config.isMessaging && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          Lead intake
                        </span>
                      )}
                    </div>
                    {/* Description line — varies by state */}
                    {channel === "whatsapp" ? (
                      <div className="mt-0.5 space-y-0.5">
                        {waIntegrationStatus?.metaPersistedButTwilioSelected ? (
                          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1 leading-snug">
                            Meta credentials are saved, but Twilio is still the active WhatsApp provider.
                            Open WhatsApp settings and switch to Meta Cloud API for production routing.
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600">
                          {waIntegrationStatus === undefined
                            ? "Loading connection…"
                            : waIntegrationStatus.whatsappConnectedReason === "meta"
                              ? "Connected via Meta Cloud API"
                              : waIntegrationStatus.whatsappConnectedReason === "twilio"
                                ? "Connected via Twilio"
                                : "Not connected"}
                        </p>
                        <p className="text-[10px] text-gray-400">{config.description}</p>
                      </div>
                    ) : status === 'connected' && isFbIg ? (
                      <div className="mt-0.5 space-y-0.5">
                        {savedPageName ? (
                          <p className="text-xs text-gray-600 truncate">
                            {channel === 'facebook' ? 'Page' : 'Account'}:{' '}
                            <span className="font-medium">{savedPageName}</span>
                          </p>
                        ) : null}
                        <p className="text-[10px] text-gray-400">
                          New inbound messages only — history not imported
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 truncate">
                        {status === 'pending' && isFbIg
                          ? "Credentials saved — webhook setup required to receive messages"
                          : config.description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {status === 'connected' && config.isMessaging && (
                    <Switch
                      checked={enabled}
                      onCheckedChange={(checked) => toggleChannel(channel, checked)}
                      disabled={updateChannelMutation.isPending}
                      data-testid={`switch-channel-${channel}`}
                    />
                  )}

                  {status === 'pending' && isFbIg && (
                    <Button
                      size="sm"
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs"
                      onClick={() => handleFbIgConnectClick(channel as 'facebook' | 'instagram')}
                      data-testid={`button-complete-setup-${channel}`}
                    >
                      Reconnect
                    </Button>
                  )}

                  {status === 'disconnected' && isFbIg && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleFbIgConnectClick(channel as 'facebook' | 'instagram')}
                      data-testid={`button-connect-${channel}`}
                    >
                      Connect
                    </Button>
                  )}

                  {status === 'disconnected' && !isFbIg && channel !== 'whatsapp' && channel !== 'sms' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfigChannel(channel)}
                      data-testid={`button-connect-${channel}`}
                    >
                      Connect
                    </Button>
                  )}

                  {status === 'disconnected' && channel === 'whatsapp' && (
                    <Button
                      variant="outline"
                      data-testid="button-setup-whatsapp"
                      size="sm"
                      onClick={() => setConfigChannel('whatsapp')}
                    >
                      Connect
                    </Button>
                  )}

                  {status === 'disconnected' && channel === 'sms' && (
                    <Button
                      variant="outline"
                      data-testid="button-setup-sms"
                      size="sm"
                      onClick={() => setConnectTwilioOpen(true)}
                    >
                      Setup Twilio
                    </Button>
                  )}

                  {status === 'connected' && isFbIg && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFbIgSettingsClick(channel as 'facebook' | 'instagram')}
                      className="text-gray-500"
                      data-testid={`button-settings-${channel}`}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}

                  {status === 'connected' && !isFbIg && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfigChannel(channel)}
                      className="text-gray-500"
                      data-testid={`button-settings-${channel}`}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
      </div>

      {/* Facebook / Instagram — OAuth connect wizard */}
      {connectFbIgConfig && (
        <ConnectMetaFbIgWizard
          open={!!connectFbIgConfig}
          onOpenChange={(v) => { if (!v) setConnectFbIgConfig(null); }}
          channel={connectFbIgConfig.channel}
          initialStage={connectFbIgConfig.initialStage}
          existingInstagramAccountId={
            connectFbIgConfig.channel === "instagram"
              ? (metaWebhookConfig?.instagram?.pageId ?? undefined)
              : undefined
          }
        />
      )}

      {/* Facebook / Instagram — manage dialog (already connected) */}
      <Dialog
        open={!!manageFbIgChannel}
        onOpenChange={(v) => { if (!v) { setManageFbIgChannel(null); setResubscribeResult(null); } }}
      >
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <ChannelBrandIcon
                channel={manageFbIgChannel === 'facebook' ? 'facebook' : 'instagram'}
              />
              <div>
                <DialogTitle>
                  {manageFbIgChannel === 'facebook' ? 'Facebook Messenger' : 'Instagram'} Settings
                </DialogTitle>
                <p className="text-xs text-gray-500 mt-0.5">Connection settings</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-emerald-800 font-medium">
                  {manageFbIgChannel === 'facebook' ? 'Facebook Messenger' : 'Instagram'} is connected
                </p>
                {manageChannelData?.pageName && (
                  <p className="text-xs text-emerald-700 mt-0.5">{manageChannelData.pageName}</p>
                )}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
              <p className="font-medium text-gray-700">New inbound messages only</p>
              <p>Existing conversation history is not imported — only messages received after connecting will appear in your inbox.</p>
            </div>

            <div className="pt-1 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setResubscribeResult(null);
                  resubscribeMutation.mutate(manageFbIgChannel!);
                }}
                disabled={resubscribeMutation.isPending}
                data-testid="button-refresh-webhook"
              >
                {resubscribeMutation.isPending
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Checking…</>
                  : "Refresh Webhook Subscription"
                }
              </Button>
              {resubscribeResult && (
                <div className={`p-2 rounded text-xs ${resubscribeResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  {resubscribeResult.message}
                </div>
              )}
              <p className="text-[11px] text-gray-400 text-center">
                Use this if you connected your page but inbound messages aren't arriving.
              </p>
            </div>

            <div className="pt-1 border-t space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setManageFbIgChannel(null);
                  handleFbIgConnectClick(manageFbIgChannel!);
                }}
                data-testid="button-reconnect-meta"
              >
                Reconnect with {manageFbIgChannel === 'facebook' ? 'Facebook' : 'Instagram'}
              </Button>
              <p className="text-[11px] text-gray-400 text-center">
                Use this to switch to a different {manageFbIgChannel === 'facebook' ? 'Page' : 'Instagram account'} or refresh your permissions.
              </p>
            </div>

            <div className="pt-2 border-t space-y-2">
              <p className="text-xs font-semibold text-red-600">Danger Zone</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (manageIntegration) {
                    disconnectFbIgMutation.mutate(manageIntegration.id);
                  }
                }}
                disabled={disconnectFbIgMutation.isPending || !manageIntegration}
                data-testid={`button-disconnect-${manageFbIgChannel}`}
              >
                {disconnectFbIgMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  : <Trash2 className="h-4 w-4 mr-1" />
                }
                Disconnect {manageFbIgChannel === 'facebook' ? 'Facebook Messenger' : 'Instagram'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp — Meta Embedded Signup + Twilio */}
      <Dialog open={configChannel === 'whatsapp'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent className="max-w-lg md:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ChannelBrandIcon channel="whatsapp" />
              Connect WhatsApp
            </DialogTitle>
          </DialogHeader>
          {whatsappEmbeddedInlineError && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
              {whatsappEmbeddedInlineError}
            </div>
          )}
          <ConnectWhatsAppHub
            onClose={() => setConfigChannel(null)}
            onOpenTwilio={() => {
              setConfigChannel(null);
              setConnectTwilioOpen(true);
            }}
            onOpenManualMeta={() => {
              setConfigChannel(null);
              setConnectMetaOpen(true);
            }}
          />
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
            <p className="text-xs text-amber-800">
              <strong>Note:</strong> SMS uses Twilio. Meta Cloud API is WhatsApp-only. If both Twilio and Meta are connected, pick the active sender under Integrations or switch provider after connecting.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <ConnectMetaWizard open={connectMetaOpen} onOpenChange={setConnectMetaOpen} />
      <ConnectTwilioWizard open={connectTwilioOpen} onOpenChange={setConnectTwilioOpen} />

      {/* Telegram */}
      {(() => {
        const telegramChannel = channels.find(c => c.channel === 'telegram');
        const existingUsername = (telegramChannel?.config as any)?.botUsername as string | undefined;
        const isAlreadyConnected = telegramChannel?.isConnected && existingUsername;
        const activeResult = telegramConnectResult ?? (isAlreadyConnected ? { username: existingUsername!, botLink: `https://t.me/${existingUsername}` } : null);

        return (
          <Dialog
            open={configChannel === 'telegram'}
            onOpenChange={(open) => {
              if (!open) {
                setConfigChannel(null);
                resetTelegramDialog();
              }
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ChannelBrandIcon channel="telegram" />
                  {activeResult ? 'Telegram Connected' : 'Connect Telegram'}
                </DialogTitle>
              </DialogHeader>

              {/* ── Already / just connected ── */}
              {activeResult ? (
                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">Connected successfully</p>
                      <p className="text-sm text-green-700">@{activeResult.username}</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.open(activeResult.botLink, '_blank')}
                    data-testid="button-open-telegram-bot"
                  >
                    Open @{activeResult.username}
                  </Button>
                  <Button
                    variant="ghost"
                    className="w-full text-sm text-gray-500"
                    onClick={() => {
                      resetTelegramDialog();
                    }}
                    data-testid="button-reconnect-telegram"
                  >
                    Connect a different bot
                  </Button>
                </div>
              ) : (
                <div className="mt-2">
                  {/* Step indicators */}
                  <div className="flex items-center gap-2 mb-5">
                    {[1, 2, 3].map((s) => (
                      <div key={s} className="flex items-center gap-2">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                          telegramStep === s
                            ? "bg-blue-600 text-white"
                            : telegramStep > s
                            ? "bg-green-500 text-white"
                            : "bg-gray-200 text-gray-500"
                        )}>
                          {telegramStep > s ? <Check className="h-3 w-3" /> : s}
                        </div>
                        {s < 3 && <div className={cn("flex-1 h-px w-8", telegramStep > s ? "bg-green-400" : "bg-gray-200")} />}
                      </div>
                    ))}
                  </div>

                  {/* Step 1: BotFather instructions */}
                  {telegramStep === 1 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">Create a Telegram bot</p>
                        <p className="text-sm text-gray-500">
                          You'll need a Telegram bot to receive messages. Create one in under 2 minutes using Telegram's official tool.
                        </p>
                      </div>
                      <ol className="space-y-2 text-sm text-gray-600">
                        <li className="flex gap-2"><span className="font-semibold text-gray-800 shrink-0">1.</span> Open BotFather in Telegram</li>
                        <li className="flex gap-2"><span className="font-semibold text-gray-800 shrink-0">2.</span> Send <code className="bg-gray-100 px-1 rounded text-xs">/newbot</code> and follow the prompts</li>
                        <li className="flex gap-2"><span className="font-semibold text-gray-800 shrink-0">3.</span> Copy the bot token it gives you</li>
                      </ol>
                      <Button
                        className="w-full"
                        onClick={() => window.open('https://t.me/BotFather', '_blank')}
                        data-testid="button-open-botfather"
                        style={{ backgroundColor: CHANNEL_CONFIG.telegram.color }}
                      >
                        Open BotFather
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setTelegramStep(2)}
                        data-testid="button-telegram-step1-next"
                      >
                        I already have a bot token →
                      </Button>
                    </div>
                  )}

                  {/* Step 2: Token input */}
                  {telegramStep === 2 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">Enter your bot token</p>
                        <p className="text-sm text-gray-500 mb-3">
                          Paste the token you received from BotFather. It looks like <span className="font-mono text-xs bg-gray-100 px-1 rounded">123456:ABC-DEF...</span>
                        </p>
                        <Input
                          placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                          value={telegramToken}
                          onChange={(e) => { setTelegramToken(e.target.value); setTelegramError(null); }}
                          autoFocus
                          data-testid="input-telegram-token"
                        />
                        {telegramError && (
                          <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            {telegramError}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => { setTelegramStep(1); setTelegramError(null); }}
                          data-testid="button-telegram-step2-back"
                        >
                          ← Back
                        </Button>
                        <Button
                          className="flex-1"
                          disabled={!telegramToken.trim()}
                          onClick={() => setTelegramStep(3)}
                          data-testid="button-telegram-step2-next"
                        >
                          Next →
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Confirm & connect */}
                  {telegramStep === 3 && (
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">Ready to connect</p>
                        <p className="text-sm text-gray-500">
                          We'll verify your bot token and set everything up automatically. No technical steps needed.
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                        <p>✓ Validate your bot token</p>
                        <p>✓ Configure message delivery automatically</p>
                        <p>✓ Start receiving messages in your inbox</p>
                      </div>
                      {telegramError && (
                        <p className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" />
                          {telegramError}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => { setTelegramStep(2); setTelegramError(null); }}
                          disabled={connectTelegramMutation.isPending}
                          data-testid="button-telegram-step3-back"
                        >
                          ← Back
                        </Button>
                        <Button
                          className="flex-1"
                          onClick={() => connectTelegramMutation.mutate(telegramToken)}
                          disabled={connectTelegramMutation.isPending}
                          data-testid="button-connect-telegram"
                          style={{ backgroundColor: CHANNEL_CONFIG.telegram.color }}
                        >
                          {connectTelegramMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Connecting…</>
                          ) : (
                            "Connect Bot"
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Web Chat */}
      <Dialog open={configChannel === 'webchat'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" style={{ color: CHANNEL_CONFIG.webchat.color }} />
              Web Chat Widget
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Embed Code</Label>
              <p className="text-xs text-gray-500 mb-2">Add this script to your website</p>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
                {`<script src="${webhookBaseUrl}/widget.js" data-user-id="${user?.id || 'YOUR_USER_ID'}"></script>`}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  copyWebhookUrl(`<script src="${webhookBaseUrl}/widget.js" data-user-id="${user?.id}"></script>`);
                }}
                data-testid="button-copy-webchat-code"
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                Copy Code
              </Button>
            </div>
            <div>
              <Label>API Endpoint</Label>
              <p className="text-xs text-gray-500 mb-2">Send messages via POST request</p>
              <Input
                readOnly
                value={`${webhookBaseUrl}/api/webchat/${user?.id || 'YOUR_USER_ID'}`}
                className="text-xs font-mono bg-gray-50"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                updateChannelMutation.mutate({
                  channel: 'webchat',
                  data: { isConnected: true, isEnabled: true },
                });
                setConfigChannel(null);
              }}
              disabled={updateChannelMutation.isPending}
              data-testid="button-enable-webchat"
            >
              Enable Web Chat
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* TikTok */}
      {(() => {
        const tiktokChannel = channels.find(c => c.channel === 'tiktok');
        const isAlreadyEnabled = tiktokChannel?.isConnected && tiktokChannel?.isEnabled;
        const webhookUrl = `${webhookBaseUrl}/api/webhook/tiktok/lead`;

        const TiktokWebhookRow = () => (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-700">Where TikTok sends your leads</p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={webhookUrl}
                className="text-xs font-mono bg-gray-50"
                data-testid="input-tiktok-webhook-url"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copyText(webhookUrl, setTiktokCopied)}
                data-testid="button-copy-tiktok-webhook"
              >
                {tiktokCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        );

        const TestLeadButton = () => (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => sendTestLeadMutation.mutate()}
            disabled={sendTestLeadMutation.isPending}
            data-testid="button-tiktok-test-lead"
          >
            {sendTestLeadMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : tiktokTestLeadSent ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <FlaskConical className="h-3.5 w-3.5" />
            )}
            {tiktokTestLeadSent ? "Test lead sent!" : "Send Test Lead"}
          </Button>
        );

        return (
          <Dialog
            open={configChannel === 'tiktok'}
            onOpenChange={(open) => {
              if (!open) { setConfigChannel(null); resetTiktokDialog(); }
            }}
          >
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ChannelBrandIcon channel="tiktok" />
                  TikTok Lead Capture
                </DialogTitle>
              </DialogHeader>

              {/* ── Already active: success view ── */}
              {isAlreadyEnabled && tiktokMode === 'select' ? (
                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-800">TikTok lead capture is active</p>
                      <p className="text-xs text-green-700">New leads will appear in your inbox automatically</p>
                    </div>
                  </div>
                  <TiktokWebhookRow />
                  <div className="flex items-center justify-between">
                    <TestLeadButton />
                    <button
                      className="text-xs text-gray-400 hover:text-gray-600 underline"
                      onClick={() => {
                        updateChannelMutation.mutate({ channel: 'tiktok', data: { isConnected: false, isEnabled: false } });
                        setTiktokMode('select');
                      }}
                      data-testid="button-tiktok-reconfigure"
                    >
                      Reconfigure
                    </button>
                  </div>
                </div>

              /* ── Mode select ── */
              ) : tiktokMode === 'select' ? (
                <div className="space-y-3 mt-2">
                  <p className="text-sm text-gray-500">
                    TikTok Lead Gen forms send new leads straight into your inbox. Choose how you'd like to connect:
                  </p>
                  <button
                    className="w-full text-left p-4 rounded-xl border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100 transition-colors group"
                    onClick={() => setTiktokMode('zapier')}
                    data-testid="button-tiktok-select-zapier"
                  >
                    <div className="flex items-start gap-3">
                      <Zap className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">Connect via Zapier</span>
                          <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Recommended</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">No code needed — guided setup in minutes</p>
                      </div>
                    </div>
                  </button>
                  <button
                    className="w-full text-left p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    onClick={() => setTiktokMode('webhook')}
                    data-testid="button-tiktok-select-webhook"
                  >
                    <div className="flex items-start gap-3">
                      <Globe className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-gray-900">Use a webhook directly</span>
                        <p className="text-xs text-gray-500 mt-0.5">For developers — paste URL into any platform</p>
                      </div>
                    </div>
                  </button>
                </div>

              /* ── Zapier flow ── */
              ) : tiktokMode === 'zapier' ? (
                <div className="space-y-4 mt-2">
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => setTiktokMode('select')}
                  >
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>

                  <div>
                    <p className="text-sm font-medium text-gray-900 mb-3">Set up your Zap</p>
                    <ol className="space-y-3">
                      {[
                        { n: 1, text: 'Open the Zap template below and click "Use this Zap"' },
                        { n: 2, text: "Connect your TikTok account when prompted" },
                        { n: 3, text: "Use this URL in Zapier to send leads into WhachatCRM:" },
                      ].map(({ n, text }) => (
                        <li key={n} className="flex gap-3 text-sm text-gray-600">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 text-gray-700 text-xs flex items-center justify-center font-semibold">{n}</span>
                          <span>{text}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <TiktokWebhookRow />
                  <Button
                    className="w-full gap-2"
                    onClick={() => window.open('https://zapier.com/apps/tiktok-lead-generation/integrations/webhooks', '_blank')}
                    data-testid="button-open-zap-template"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Zap Template
                  </Button>

                  {/* Waiting indicator — activates automatically on first lead */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span className="text-xs text-gray-500">Waiting for first lead…</span>
                    </div>
                    <TestLeadButton />
                  </div>
                </div>

              /* ── Webhook flow ── */
              ) : tiktokMode === 'webhook' ? (
                <div className="space-y-4 mt-2">
                  <button
                    className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                    onClick={() => setTiktokMode('select')}
                  >
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                  <TiktokWebhookRow />

                  {/* Collapsible JSON format */}
                  <button
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 w-full"
                    onClick={() => setTiktokWebhookExpanded(v => !v)}
                    data-testid="button-tiktok-toggle-json"
                  >
                    {tiktokWebhookExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    View JSON format
                  </button>
                  {tiktokWebhookExpanded && (
                    <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "userId": "${user?.id || 'YOUR_USER_ID'}",
  "name": "Lead Name",
  "phone": "+1234567890",
  "email": "lead@example.com",
  "source": "tiktok_ad"
}`}
                    </div>
                  )}

                  {/* Waiting indicator — activates automatically on first lead */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                      <span className="text-xs text-gray-500">Waiting for first lead…</span>
                    </div>
                    <TestLeadButton />
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
