import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle,
  Instagram,
  Facebook,
  Smartphone,
  Globe,
  Send,
  Video,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Check,
  Settings2,
  ArrowRightLeft,
  AlertCircle,
  Eye,
  EyeOff,
  Trash2,
  Clock,
} from "lucide-react";
import { ConnectMetaWizard } from "@/components/ConnectMetaWizard";
import { ConnectTwilioWizard } from "@/components/ConnectTwilioWizard";
import { ConnectMetaFbIgWizard } from "@/components/ConnectMetaFbIgWizard";
import { createMetaWizardTour, createTwilioWizardTour } from "@/lib/tour";
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
  icon: any;
  color: string;
  label: string;
  description: string;
  isMessaging: boolean;
}> = {
  whatsapp: {
    icon: MessageCircle,
    color: '#25D366',
    label: 'WhatsApp',
    description: 'Primary messaging channel',
    isMessaging: true,
  },
  instagram: {
    icon: Instagram,
    color: '#E4405F',
    label: 'Instagram',
    description: 'Direct messages via Meta Graph API',
    isMessaging: true,
  },
  facebook: {
    icon: Facebook,
    color: '#1877F2',
    label: 'Facebook Messenger',
    description: 'Messages via Meta Graph API',
    isMessaging: true,
  },
  sms: {
    icon: Smartphone,
    color: '#6B7280',
    label: 'SMS',
    description: 'Text messages via Twilio',
    isMessaging: true,
  },
  webchat: {
    icon: Globe,
    color: '#3B82F6',
    label: 'Web Chat',
    description: 'Embed a chat widget on your website',
    isMessaging: true,
  },
  telegram: {
    icon: Send,
    color: '#0088CC',
    label: 'Telegram',
    description: 'Connect your Telegram bot',
    isMessaging: true,
  },
  tiktok: {
    icon: Video,
    color: '#000000',
    label: 'TikTok',
    description: 'Lead intake only (not messaging)',
    isMessaging: false,
  },
};

export function ChannelSettings() {
  const queryClient = useQueryClient();
  const [configChannel, setConfigChannel] = useState<Channel | null>(null);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramStep, setTelegramStep] = useState<1 | 2 | 3>(1);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramConnectResult, setTelegramConnectResult] = useState<{ username: string; botLink: string } | null>(null);
  const [copied, setCopied] = useState(false);
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

  const startMetaTour = () => {
    const tour = createMetaWizardTour(() => {
      localStorage.setItem("meta_tour_seen", "true");
    });
    tour.drive();
  };

  const startTwilioTour = () => {
    const tour = createTwilioWizardTour(() => {
      localStorage.setItem("twilio_tour_seen", "true");
    });
    tour.drive();
  };

  useEffect(() => {
    if (connectMetaOpen) {
      const hasSeenTour = localStorage.getItem("meta_tour_seen");
      if (!hasSeenTour) {
        const timer = setTimeout(() => {
          startMetaTour();
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [connectMetaOpen]);

  useEffect(() => {
    if (connectTwilioOpen) {
      const hasSeenTour = localStorage.getItem("twilio_tour_seen");
      if (!hasSeenTour) {
        const timer = setTimeout(() => {
          startTwilioTour();
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [connectTwilioOpen]);

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

  const { data: channels = [], isLoading } = useQuery<ChannelSetting[]>({
    queryKey: ["/api/channels"],
  });

  const { data: user } = useQuery<{
    id: string;
    twilioConnected?: boolean;
    metaConnected?: boolean;
    whatsappProvider?: string;
  }>({
    queryKey: ["/api/auth/me"],
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

  const disconnectMetaMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meta/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to disconnect Meta");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/meta/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/channels"] });
      toast({ title: "Meta disconnected", description: "Your Meta WhatsApp Business API has been disconnected." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to disconnect Meta. Please try again.", variant: "destructive" });
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
    mutationFn: async (channel: 'facebook' | 'instagram') => {
      const res = await fetch(`/api/integrations/meta/resubscribe`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to re-subscribe");
      return data;
    },
    onSuccess: (data) => {
      setResubscribeResult({ success: data.resubscribed, message: data.message });
    },
    onError: (err: any) => {
      setResubscribeResult({ success: false, message: err.message || "Failed to refresh webhook subscription." });
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
            const Icon = config.icon;
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
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${config.color}15` }}
                  >
                    <Icon className="h-4 w-4" style={{ color: config.color }} />
                  </div>
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
                    {status === 'connected' && isFbIg ? (
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
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  backgroundColor: manageFbIgChannel === 'facebook' ? '#1877F220' : '#E4405F20',
                }}
              >
                {manageFbIgChannel === 'facebook'
                  ? <Facebook className="h-5 w-5 text-blue-600" />
                  : <Instagram className="h-5 w-5 text-pink-600" />
                }
              </div>
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

      {/* WhatsApp provider selector */}
      <Dialog open={configChannel === 'whatsapp'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" style={{ color: CHANNEL_CONFIG.whatsapp.color }} />
              WhatsApp Provider
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-sm text-gray-600">
              Choose how you want to connect WhatsApp. You can switch providers anytime.
            </p>

            <div className="space-y-3">
              <div
                className={cn(
                  "border rounded-lg p-4 cursor-pointer transition-all",
                  user?.whatsappProvider === 'twilio' && user?.twilioConnected
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
                onClick={() => {
                  if (!user?.twilioConnected) {
                    setConfigChannel(null);
                    setConnectTwilioOpen(true);
                  } else if (user?.whatsappProvider !== 'twilio') {
                    switchProviderMutation.mutate('twilio');
                  }
                }}
                data-testid="option-twilio-whatsapp"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-red-50 rounded-lg flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">Twilio</h4>
                      <p className="text-xs text-gray-500">WhatsApp + SMS support</p>
                    </div>
                  </div>
                  {user?.twilioConnected ? (
                    user?.whatsappProvider === 'twilio' ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Active</span>
                    ) : (
                      <span className="text-xs text-gray-500">Connected</span>
                    )
                  ) : (
                    <span className="text-xs text-blue-600">Setup required</span>
                  )}
                </div>
              </div>

              <div
                className={cn(
                  "border rounded-lg p-4 cursor-pointer transition-all",
                  user?.whatsappProvider === 'meta' && user?.metaConnected
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-gray-200 hover:border-gray-300"
                )}
                onClick={() => {
                  if (!user?.metaConnected) {
                    setConfigChannel(null);
                    setConnectMetaOpen(true);
                  } else if (user?.whatsappProvider !== 'meta') {
                    switchProviderMutation.mutate('meta');
                  }
                }}
                data-testid="option-meta-whatsapp"
                data-tour="meta-connect-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-blue-50 rounded-lg flex items-center justify-center">
                      <img
                        src="https://upload.wikimedia.org/wikipedia/commons/7/7b/Meta_Platforms_Inc._logo.svg"
                        alt="Meta"
                        className="h-5 w-5"
                      />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">Meta Business API</h4>
                      <p className="text-xs text-gray-500">Direct connection to Meta (requires existing Meta App & WABA)</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">WhatsApp only · No SMS · No message markup</p>
                    </div>
                  </div>
                  {user?.metaConnected ? (
                    user?.whatsappProvider === 'meta' ? (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Active</span>
                    ) : (
                      <span className="text-xs text-gray-500">Connected</span>
                    )
                  ) : (
                    <span className="text-xs text-blue-600">Connect</span>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                <strong>Note:</strong> SMS messaging requires Twilio. Meta only supports WhatsApp.
              </p>
            </div>

            {(user?.twilioConnected || user?.metaConnected) && user?.whatsappProvider && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <ArrowRightLeft className="h-3 w-3" />
                  Click on the other provider to switch
                </p>
              </div>
            )}

            {user?.metaConnected && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => disconnectMetaMutation.mutate()}
                disabled={disconnectMetaMutation.isPending}
                data-testid="button-disconnect-meta"
              >
                {disconnectMetaMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : null}
                Disconnect Meta
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConnectMetaWizard
        open={connectMetaOpen}
        onOpenChange={setConnectMetaOpen}
        onStartTour={startMetaTour}
      />
      <ConnectTwilioWizard
        open={connectTwilioOpen}
        onOpenChange={setConnectTwilioOpen}
        onStartTour={startTwilioTour}
      />

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
                  <Send className="h-5 w-5" style={{ color: CHANNEL_CONFIG.telegram.color }} />
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
      <Dialog open={configChannel === 'tiktok'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              TikTok Lead Intake
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                TikTok is for lead capture only. You cannot send messages through TikTok —
                leads will be reached via WhatsApp, SMS, or other channels.
              </p>
            </div>
            <div>
              <Label>Webhook URL</Label>
              <p className="text-xs text-gray-500 mb-2">
                Use this endpoint to send leads from TikTok Lead Gen forms or Zapier
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${webhookBaseUrl}/api/webhook/tiktok/lead`}
                  className="text-xs font-mono bg-gray-50"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyWebhookUrl(`${webhookBaseUrl}/api/webhook/tiktok/lead`)}
                  data-testid="button-copy-tiktok-webhook"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <Label>Request Body Format</Label>
              <div className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs font-mono overflow-x-auto">
{`{
  "userId": "${user?.id || 'YOUR_USER_ID'}",
  "name": "Lead Name",
  "phone": "+1234567890",
  "email": "lead@example.com",
  "source": "tiktok_ad"
}`}
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                updateChannelMutation.mutate({
                  channel: 'tiktok',
                  data: { isConnected: true, isEnabled: true },
                });
                setConfigChannel(null);
              }}
              disabled={updateChannelMutation.isPending}
              data-testid="button-enable-tiktok"
            >
              Enable TikTok Lead Intake
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
