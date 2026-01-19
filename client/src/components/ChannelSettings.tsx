import { useState } from "react";
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
  ChevronRight,
  ArrowRightLeft,
} from "lucide-react";
import { ConnectMetaWizard } from "@/components/ConnectMetaWizard";
import { ConnectTwilioWizard } from "@/components/ConnectTwilioWizard";
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
  const [copied, setCopied] = useState(false);
  const [connectMetaOpen, setConnectMetaOpen] = useState(false);
  const [connectTwilioOpen, setConnectTwilioOpen] = useState(false);

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
      const res = await fetch("/api/user/meta/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to disconnect Meta");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Meta disconnected" });
    },
  });

  const getChannelStatus = (channel: Channel) => {
    const setting = channels.find(c => c.channel === channel);
    
    if (channel === 'whatsapp') {
      if (user?.whatsappProvider === 'meta' && user?.metaConnected) {
        return 'connected';
      }
      if (user?.twilioConnected) {
        return 'connected';
      }
      return 'disconnected';
    }
    
    if (channel === 'sms') {
      return user?.twilioConnected ? 'connected' : 'disconnected';
    }
    
    return setting?.isConnected ? 'connected' : 'disconnected';
  };

  const isChannelEnabled = (channel: Channel) => {
    const setting = channels.find(c => c.channel === channel);
    return setting?.isEnabled ?? false;
  };

  const toggleChannel = (channel: Channel, enabled: boolean) => {
    updateChannelMutation.mutate({
      channel,
      data: { isEnabled: enabled },
    });
  };

  const connectTelegram = () => {
    if (!telegramToken.trim()) return;
    
    updateChannelMutation.mutate({
      channel: 'telegram',
      data: {
        isConnected: true,
        isEnabled: true,
        config: { botToken: telegramToken },
      },
    }, {
      onSuccess: () => {
        setConfigChannel(null);
        setTelegramToken("");
        toast({ title: "Telegram bot connected!" });
      },
    });
  };

  const copyWebhookUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const webhookBaseUrl = window.location.origin;

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
        {(Object.keys(CHANNEL_CONFIG) as Channel[]).map((channel) => {
          const config = CHANNEL_CONFIG[channel];
          const Icon = config.icon;
          const status = getChannelStatus(channel);
          const enabled = isChannelEnabled(channel);

          return (
            <div
              key={channel}
              className={cn(
                "flex items-center justify-between p-3 sm:p-4 rounded-lg border transition-colors",
                status === 'connected' 
                  ? "bg-gray-50 border-gray-200" 
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{config.label}</span>
                    {status === 'connected' ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-gray-300" />
                    )}
                    {!config.isMessaging && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                        Lead intake
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{config.description}</p>
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
                {status === 'disconnected' && channel !== 'whatsapp' && channel !== 'sms' && (
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
                {status === 'connected' && (
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
                      <p className="text-xs text-gray-500">WhatsApp only (no SMS)</p>
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

      <ConnectMetaWizard open={connectMetaOpen} onOpenChange={setConnectMetaOpen} />
      <ConnectTwilioWizard open={connectTwilioOpen} onOpenChange={setConnectTwilioOpen} />

      <Dialog open={configChannel === 'telegram'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" style={{ color: CHANNEL_CONFIG.telegram.color }} />
              Connect Telegram Bot
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Bot Token</Label>
              <p className="text-xs text-gray-500 mb-2">
                Get this from @BotFather on Telegram
              </p>
              <Input
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                data-testid="input-telegram-token"
              />
            </div>
            <div>
              <Label>Webhook URL</Label>
              <p className="text-xs text-gray-500 mb-2">
                Set this as your bot's webhook URL
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${webhookBaseUrl}/api/webhook/telegram/${user?.id || 'YOUR_USER_ID'}`}
                  className="text-xs font-mono bg-gray-50"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyWebhookUrl(`${webhookBaseUrl}/api/webhook/telegram/${user?.id}`)}
                  data-testid="button-copy-telegram-webhook"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={connectTelegram}
              disabled={!telegramToken.trim() || updateChannelMutation.isPending}
              data-testid="button-save-telegram"
            >
              {updateChannelMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Connect Telegram"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              <p className="text-xs text-gray-500 mb-2">
                Add this script to your website
              </p>
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
              <p className="text-xs text-gray-500 mb-2">
                Send messages via POST request
              </p>
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
                TikTok is for lead capture only. You cannot send messages through TikTok - 
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

      <Dialog open={configChannel === 'instagram' || configChannel === 'facebook'} onOpenChange={() => setConfigChannel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {configChannel === 'instagram' ? (
                <Instagram className="h-5 w-5" style={{ color: CHANNEL_CONFIG.instagram.color }} />
              ) : (
                <Facebook className="h-5 w-5" style={{ color: CHANNEL_CONFIG.facebook.color }} />
              )}
              Connect {configChannel === 'instagram' ? 'Instagram' : 'Facebook Messenger'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">
                To connect {configChannel === 'instagram' ? 'Instagram' : 'Facebook Messenger'}, 
                you need to set up Meta (Facebook) integration first.
              </p>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setConfigChannel(null);
                const integrationLink = document.querySelector('[data-testid="sidebar-integrations"]') as HTMLAnchorElement;
                if (integrationLink) {
                  integrationLink.click();
                }
              }}
              data-testid="button-goto-integrations"
            >
              <ChevronRight className="h-4 w-4 mr-1" />
              Go to Integrations
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
