import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { 
  Plug, Plus, Trash2, Copy, Check, ExternalLink, Zap, Lock,
  ShoppingCart, FileSpreadsheet, Users, CreditCard, Building2, Home,
  Webhook, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Settings2,
  Calendar
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const WEBHOOK_EVENTS = [
  { id: "new_chat", label: "New Conversation", description: "When a new chat is created" },
  { id: "message_received", label: "Message Received", description: "When an inbound message arrives" },
  { id: "message_sent", label: "Message Sent", description: "When an outbound message is sent" },
  { id: "tag_changed", label: "Tag Changed", description: "When a chat's tag is updated" },
  { id: "pipeline_changed", label: "Pipeline Stage Changed", description: "When a deal moves stages" },
  { id: "followup_due", label: "Follow-up Due", description: "When a follow-up reminder is triggered" },
  { id: "chat_assigned", label: "Chat Assigned", description: "When a chat is assigned to a team member" },
];

interface IntegrationConfig {
  id: string;
  name: string;
  icon: any;
  description: string;
  color: string;
  fields: { key: string; label: string; placeholder: string; type?: string; helpText?: string }[];
  syncOptions?: { id: string; label: string; description: string }[];
}

const NATIVE_INTEGRATIONS: IntegrationConfig[] = [
  { 
    id: "shopify", 
    name: "Shopify", 
    icon: ShoppingCart, 
    description: "Auto-create leads from new orders and customers", 
    color: "bg-green-500",
    fields: [
      { key: "shopUrl", label: "Shop URL", placeholder: "your-store.myshopify.com", helpText: "Your Shopify store URL" },
      { key: "accessToken", label: "Admin API Access Token", placeholder: "shpat_xxxxx", type: "password", helpText: "Create in Shopify Admin > Apps > Develop apps" },
    ],
    syncOptions: [
      { id: "new_orders", label: "New Orders", description: "Create a chat when a new order is placed" },
      { id: "abandoned_carts", label: "Abandoned Carts", description: "Create a chat for abandoned checkouts" },
      { id: "new_customers", label: "New Customers", description: "Create a chat when a customer signs up" },
    ]
  },
  { 
    id: "google_sheets", 
    name: "Google Sheets", 
    icon: FileSpreadsheet, 
    description: "Export leads and conversations to spreadsheets", 
    color: "bg-emerald-500",
    fields: [
      { key: "spreadsheetId", label: "Spreadsheet ID", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", helpText: "Found in the spreadsheet URL after /d/" },
      { key: "serviceAccountEmail", label: "Service Account Email", placeholder: "your-service@project.iam.gserviceaccount.com", helpText: "Share your spreadsheet with this email" },
      { key: "privateKey", label: "Private Key (JSON)", placeholder: '{"type": "service_account", ...}', type: "password", helpText: "Full JSON key file contents" },
    ],
    syncOptions: [
      { id: "export_leads", label: "Export Leads", description: "Sync all leads to a sheet automatically" },
      { id: "export_conversations", label: "Export Conversations", description: "Log all messages to a sheet" },
    ]
  },
  { 
    id: "hubspot", 
    name: "HubSpot", 
    icon: Users, 
    description: "Bi-directional contact and deal sync", 
    color: "bg-orange-500",
    fields: [
      { key: "accessToken", label: "Private App Access Token", placeholder: "pat-na1-xxxxx", type: "password", helpText: "Create in HubSpot Settings > Integrations > Private Apps" },
    ],
    syncOptions: [
      { id: "sync_contacts", label: "Sync Contacts", description: "Keep WhatsApp leads synced with HubSpot contacts" },
      { id: "sync_deals", label: "Sync Deals", description: "Create HubSpot deals from pipeline changes" },
      { id: "import_contacts", label: "Import Contacts", description: "Import existing HubSpot contacts as chats" },
    ]
  },
  { 
    id: "salesforce", 
    name: "Salesforce", 
    icon: Building2, 
    description: "Enterprise CRM integration for leads and opportunities", 
    color: "bg-blue-500",
    fields: [
      { key: "instanceUrl", label: "Instance URL", placeholder: "https://yourcompany.salesforce.com", helpText: "Your Salesforce org URL" },
      { key: "clientId", label: "Consumer Key", placeholder: "3MVG9...", helpText: "From Connected App settings" },
      { key: "clientSecret", label: "Consumer Secret", placeholder: "xxxxx", type: "password" },
      { key: "refreshToken", label: "Refresh Token", placeholder: "5Aep861...", type: "password", helpText: "OAuth refresh token" },
    ],
    syncOptions: [
      { id: "sync_leads", label: "Sync Leads", description: "Create Salesforce leads from WhatsApp chats" },
      { id: "sync_opportunities", label: "Sync Opportunities", description: "Create opportunities when deals close" },
    ]
  },
  { 
    id: "stripe", 
    name: "Stripe", 
    icon: CreditCard, 
    description: "Create leads from payments and subscriptions", 
    color: "bg-purple-500",
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_xxxxx", type: "password", helpText: "Found in Stripe Dashboard > Developers > API keys" },
      { key: "webhookSecret", label: "Webhook Signing Secret", placeholder: "whsec_xxxxx", type: "password", helpText: "From webhook endpoint settings" },
    ],
    syncOptions: [
      { id: "new_customers", label: "New Customers", description: "Create a chat when someone pays" },
      { id: "failed_payments", label: "Failed Payments", description: "Alert on failed payment attempts" },
      { id: "subscription_changes", label: "Subscription Changes", description: "Track subscription upgrades/cancellations" },
    ]
  },
  { 
    id: "showcase_idx", 
    name: "Showcase IDX", 
    icon: Home, 
    description: "Real estate lead capture and property inquiries", 
    color: "bg-red-500",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "xxxxx-xxxxx-xxxxx", type: "password", helpText: "From Showcase IDX dashboard" },
      { key: "siteId", label: "Site ID", placeholder: "12345", helpText: "Your Showcase IDX site identifier" },
    ],
    syncOptions: [
      { id: "new_leads", label: "New Leads", description: "Create a chat for new property inquiries" },
      { id: "saved_searches", label: "Saved Searches", description: "Alert when leads save property searches" },
      { id: "favorites", label: "Property Favorites", description: "Notify when leads favorite properties" },
    ]
  },
  { 
    id: "calendly", 
    name: "Calendly", 
    icon: Calendar, 
    description: "Auto-create leads when meetings are booked", 
    color: "bg-blue-600",
    fields: [
      { key: "accessToken", label: "Personal Access Token", placeholder: "eyJraWQiOiIxY...", type: "password", helpText: "Create at calendly.com/integrations/api_webhooks" },
      { key: "webhookSigningKey", label: "Webhook Signing Key", placeholder: "xxxxx", type: "password", helpText: "Optional: For webhook signature verification" },
    ],
    syncOptions: [
      { id: "new_bookings", label: "New Bookings", description: "Create a chat when someone books a meeting" },
      { id: "cancellations", label: "Cancellations", description: "Notify when meetings are cancelled" },
      { id: "reschedules", label: "Reschedules", description: "Update chat when meetings are rescheduled" },
    ]
  },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: string | null;
  failureCount: number;
  createdAt: string;
}

interface Integration {
  id: string;
  type: string;
  name: string;
  config: Record<string, any>;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

function WebhookUrlDisplay({ integrationType }: { integrationType: string }) {
  const [copied, setCopied] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  
  const baseUrl = window.location.origin;
  const { data: user } = useQuery<{ id: string }>({
    queryKey: ["/api/user"],
  });
  
  const webhookUrl = user ? `${baseUrl}/api/webhooks/${integrationType}/${user.id}` : '';
  
  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const getInstructions = () => {
    switch (integrationType) {
      case 'shopify':
        return [
          "Go to Shopify Admin → Settings → Notifications → Webhooks",
          "Click 'Create webhook'",
          "Select events: orders/create, customers/create",
          "Paste the webhook URL above",
          "Format: JSON"
        ];
      case 'calendly':
        return [
          "Go to Calendly → Integrations → Webhooks",
          "Click 'Create Webhook'",
          "Paste the webhook URL above",
          "Select events: invitee.created, invitee.canceled",
          "Click 'Subscribe'"
        ];
      case 'stripe':
        return [
          "Go to Stripe Dashboard → Developers → Webhooks",
          "Click 'Add endpoint'",
          "Paste the webhook URL above",
          "Select events: checkout.session.completed, payment_intent.succeeded",
          "Click 'Add endpoint'"
        ];
      case 'hubspot':
        return [
          "Go to HubSpot → Settings → Integrations → Private Apps",
          "Create or edit your app",
          "Go to Webhooks tab",
          "Add subscription for 'contact.creation'",
          "Set webhook URL to the URL above"
        ];
      default:
        return ["Configure the webhook URL in your service"];
    }
  };
  
  if (!user) return null;
  
  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Webhook URL</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setShowInstructions(!showInstructions)}
        >
          {showInstructions ? "Hide" : "Setup"} instructions
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 bg-white px-2 py-1.5 rounded text-xs truncate border">
          {webhookUrl}
        </code>
        <Button 
          variant="outline" 
          size="icon" 
          className="h-7 w-7 shrink-0"
          onClick={copyWebhookUrl}
        >
          {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      {showInstructions && (
        <ol className="mt-3 text-xs text-gray-600 space-y-1 list-decimal list-inside">
          {getInstructions().map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function Integrations() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [connectingIntegration, setConnectingIntegration] = useState<IntegrationConfig | null>(null);
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({
    name: "",
    url: "",
    events: [] as string[],
  });
  const [integrationForm, setIntegrationForm] = useState<Record<string, string>>({});
  const [selectedSyncOptions, setSelectedSyncOptions] = useState<string[]>([]);

  const integrationsEnabled = subscription?.limits?.integrationsEnabled;
  const maxWebhooks = (subscription?.limits as any)?.maxWebhooks || 0;

  const { data: webhooks = [], isLoading: webhooksLoading } = useQuery<Webhook[]>({
    queryKey: ["/api/webhooks"],
    enabled: !!integrationsEnabled,
  });

  const { data: integrations = [], isLoading: integrationsLoading } = useQuery<Integration[]>({
    queryKey: ["/api/integrations"],
    enabled: !!integrationsEnabled,
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; events: string[] }) => {
      return apiRequest("POST", "/api/webhooks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setIsWebhookDialogOpen(false);
      setNewWebhook({ name: "", url: "", events: [] });
    },
  });

  const toggleWebhookMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/webhooks/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }),
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/webhooks/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] }),
  });

  const createIntegrationMutation = useMutation({
    mutationFn: async (data: { type: string; name: string; config: Record<string, any> }) => {
      return apiRequest("POST", "/api/integrations", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setConnectingIntegration(null);
      setIntegrationForm({});
      setSelectedSyncOptions([]);
    },
  });

  const toggleIntegrationMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/integrations/${id}`, { isActive });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }),
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/integrations/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }),
  });

  const syncIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/integrations/${id}/sync`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }),
  });

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEventToggle = (eventId: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(eventId)
        ? prev.events.filter(e => e !== eventId)
        : [...prev.events, eventId],
    }));
  };

  const handleSyncOptionToggle = (optionId: string) => {
    setSelectedSyncOptions(prev =>
      prev.includes(optionId)
        ? prev.filter(o => o !== optionId)
        : [...prev, optionId]
    );
  };

  const handleConnectIntegration = () => {
    if (!connectingIntegration) return;
    createIntegrationMutation.mutate({
      type: connectingIntegration.id,
      name: connectingIntegration.name,
      config: { ...integrationForm, syncOptions: selectedSyncOptions },
    });
  };

  const getConnectedIntegration = (type: string) => {
    return integrations.find(i => i.type === type);
  };

  if (subLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!integrationsEnabled) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
          <Lock className="h-8 w-8 text-gray-400" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Integrations are a Paid Feature</h2>
        <p className="text-gray-500 max-w-md mb-6">
          Connect WhachatCRM with your favorite tools like Shopify, HubSpot, Salesforce, and more. 
          Upgrade to Starter or Pro to unlock integrations.
        </p>
        <Link href="/pricing">
          <Button className="bg-brand-green hover:bg-brand-green/90" data-testid="button-upgrade-integrations">
            <Zap className="h-4 w-4 mr-2" />
            Upgrade Now
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-gray-500 mt-1">Connect WhachatCRM with your existing tools and workflows</p>
        </div>

        <Tabs defaultValue="native" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="native" data-testid="tab-native">
              <Plug className="h-4 w-4 mr-2" />
              Native Integrations
            </TabsTrigger>
            <TabsTrigger value="webhooks" data-testid="tab-webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
          </TabsList>

          <TabsContent value="native" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {NATIVE_INTEGRATIONS.map((integration) => {
                const connected = getConnectedIntegration(integration.id);
                return (
                  <Card key={integration.id} className="relative overflow-hidden" data-testid={`integration-card-${integration.id}`}>
                    {connected && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-green-100 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Connected
                        </Badge>
                      </div>
                    )}
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg ${integration.color} flex items-center justify-center`}>
                          <integration.icon className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{integration.name}</CardTitle>
                          <CardDescription className="text-xs">{integration.description}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {connected ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Status</span>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={connected.isActive}
                                onCheckedChange={(checked) => toggleIntegrationMutation.mutate({ id: connected.id, isActive: checked })}
                                data-testid={`switch-integration-${integration.id}`}
                              />
                              <span className={connected.isActive ? "text-green-600" : "text-gray-400"}>
                                {connected.isActive ? "Active" : "Paused"}
                              </span>
                            </div>
                          </div>
                          {connected.lastSyncAt && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-500">Last Sync</span>
                              <span className="text-gray-700">
                                {new Date(connected.lastSyncAt).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                          {['shopify', 'calendly', 'stripe', 'hubspot'].includes(integration.id) && (
                            <WebhookUrlDisplay integrationType={integration.id} />
                          )}
                          <div className="flex gap-2 pt-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="flex-1"
                              onClick={() => syncIntegrationMutation.mutate(connected.id)}
                              disabled={syncIntegrationMutation.isPending}
                              data-testid={`button-sync-${integration.id}`}
                            >
                              <RefreshCw className={`h-3 w-3 mr-1 ${syncIntegrationMutation.isPending ? 'animate-spin' : ''}`} />
                              Sync Now
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteIntegrationMutation.mutate(connected.id)}
                              data-testid={`button-disconnect-${integration.id}`}
                            >
                              <XCircle className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setConnectingIntegration(integration);
                            setIntegrationForm({});
                            setSelectedSyncOptions([]);
                          }}
                          data-testid={`button-connect-${integration.id}`}
                        >
                          Connect
                          <ExternalLink className="h-3 w-3 ml-2" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-gray-500 text-sm">
                  Need a specific integration? Use webhooks to connect with any app via Zapier or Make.com, 
                  or <a href="/contact" className="text-brand-green hover:underline">contact us</a> to request a native integration.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Webhook Endpoints</CardTitle>
                    <CardDescription>
                      Send real-time events to your apps via Zapier, Make.com, or custom endpoints
                    </CardDescription>
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-brand-green hover:bg-brand-green/90"
                    disabled={webhooks.length >= maxWebhooks}
                    onClick={() => setIsWebhookDialogOpen(true)}
                    data-testid="button-add-webhook"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Webhook
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {webhooksLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : webhooks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Webhook className="h-10 w-10 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No webhooks configured</p>
                    <p className="text-sm">Create a webhook to start receiving events</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {webhooks.map((webhook) => (
                      <div 
                        key={webhook.id} 
                        className="border rounded-lg p-4 space-y-3"
                        data-testid={`webhook-item-${webhook.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${webhook.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="font-medium">{webhook.name}</span>
                            {webhook.failureCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {webhook.failureCount} failures
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={webhook.isActive}
                              onCheckedChange={(checked) => toggleWebhookMutation.mutate({ id: webhook.id, isActive: checked })}
                              data-testid={`switch-webhook-${webhook.id}`}
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => deleteWebhookMutation.mutate(webhook.id)}
                              data-testid={`button-delete-webhook-${webhook.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-sm space-y-2">
                          <div className="flex items-center gap-2 text-gray-500">
                            <span className="shrink-0">URL:</span>
                            <code className="flex-1 bg-gray-50 px-2 py-1 rounded text-xs truncate">{webhook.url}</code>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 shrink-0"
                              onClick={() => copyToClipboard(webhook.url, `url-${webhook.id}`)}
                            >
                              {copiedId === `url-${webhook.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <span className="shrink-0">Secret:</span>
                            <code className="flex-1 bg-gray-50 px-2 py-1 rounded text-xs truncate">
                              {showSecret === webhook.id ? webhook.secret : "••••••••••••••••"}
                            </code>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 shrink-0"
                              onClick={() => setShowSecret(showSecret === webhook.id ? null : webhook.id)}
                            >
                              {showSecret === webhook.id ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-6 w-6 shrink-0"
                              onClick={() => copyToClipboard(webhook.secret, `secret-${webhook.id}`)}
                            >
                              {copiedId === `secret-${webhook.id}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {webhook.events.map((event) => (
                              <Badge key={event} variant="secondary" className="text-xs">
                                {WEBHOOK_EVENTS.find(e => e.id === event)?.label || event}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 text-center pt-2">
                      {webhooks.length} of {maxWebhooks} webhooks used
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">How Webhooks Work</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 space-y-3">
                <p>
                  Webhooks allow WhachatCRM to send real-time data to your other applications when events occur.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-gray-900">Quick Setup with Zapier:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600">
                    <li>Create a new Zap in Zapier</li>
                    <li>Choose "Webhooks by Zapier" as your trigger</li>
                    <li>Select "Catch Hook" and copy the webhook URL</li>
                    <li>Paste the URL here and select your events</li>
                  </ol>
                </div>
                <p className="text-xs text-gray-500">
                  All webhooks include an HMAC signature in the <code>X-Webhook-Signature</code> header for verification.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Webhook Dialog */}
        <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Webhook</DialogTitle>
              <DialogDescription>
                Configure a webhook endpoint to receive events
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="webhook-name">Name</Label>
                <Input
                  id="webhook-name"
                  placeholder="e.g., Zapier Integration"
                  value={newWebhook.name}
                  onChange={(e) => setNewWebhook(prev => ({ ...prev, name: e.target.value }))}
                  data-testid="input-webhook-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Endpoint URL</Label>
                <Input
                  id="webhook-url"
                  placeholder="https://hooks.zapier.com/..."
                  value={newWebhook.url}
                  onChange={(e) => setNewWebhook(prev => ({ ...prev, url: e.target.value }))}
                  data-testid="input-webhook-url"
                />
              </div>
              <div className="space-y-2">
                <Label>Events to Send</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-md p-3">
                  {WEBHOOK_EVENTS.map((event) => (
                    <div key={event.id} className="flex items-start space-x-2">
                      <Checkbox
                        id={`event-${event.id}`}
                        checked={newWebhook.events.includes(event.id)}
                        onCheckedChange={() => handleEventToggle(event.id)}
                        data-testid={`checkbox-event-${event.id}`}
                      />
                      <div className="grid gap-0.5 leading-none">
                        <label htmlFor={`event-${event.id}`} className="text-sm font-medium cursor-pointer">
                          {event.label}
                        </label>
                        <p className="text-xs text-gray-500">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsWebhookDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createWebhookMutation.mutate(newWebhook)}
                disabled={!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0 || createWebhookMutation.isPending}
                className="bg-brand-green hover:bg-brand-green/90"
                data-testid="button-save-webhook"
              >
                {createWebhookMutation.isPending ? "Creating..." : "Create Webhook"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Integration Connection Dialog */}
        <Dialog open={!!connectingIntegration} onOpenChange={(open) => !open && setConnectingIntegration(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            {connectingIntegration && (
              <>
                <DialogHeader>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${connectingIntegration.color} flex items-center justify-center`}>
                      <connectingIntegration.icon className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <DialogTitle>Connect {connectingIntegration.name}</DialogTitle>
                      <DialogDescription>{connectingIntegration.description}</DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {connectingIntegration.fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`field-${field.key}`}>{field.label}</Label>
                      <Input
                        id={`field-${field.key}`}
                        type={field.type || "text"}
                        placeholder={field.placeholder}
                        value={integrationForm[field.key] || ""}
                        onChange={(e) => setIntegrationForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                        data-testid={`input-${connectingIntegration.id}-${field.key}`}
                      />
                      {field.helpText && (
                        <p className="text-xs text-gray-500">{field.helpText}</p>
                      )}
                    </div>
                  ))}
                  
                  {connectingIntegration.syncOptions && connectingIntegration.syncOptions.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <Label>Sync Options</Label>
                      <div className="space-y-2 border rounded-md p-3">
                        {connectingIntegration.syncOptions.map((option) => (
                          <div key={option.id} className="flex items-start space-x-2">
                            <Checkbox
                              id={`sync-${option.id}`}
                              checked={selectedSyncOptions.includes(option.id)}
                              onCheckedChange={() => handleSyncOptionToggle(option.id)}
                              data-testid={`checkbox-sync-${option.id}`}
                            />
                            <div className="grid gap-0.5 leading-none">
                              <label htmlFor={`sync-${option.id}`} className="text-sm font-medium cursor-pointer">
                                {option.label}
                              </label>
                              <p className="text-xs text-gray-500">{option.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setConnectingIntegration(null)}>Cancel</Button>
                  <Button 
                    onClick={handleConnectIntegration}
                    disabled={
                      connectingIntegration.fields.some(f => !integrationForm[f.key]) ||
                      createIntegrationMutation.isPending
                    }
                    className="bg-brand-green hover:bg-brand-green/90"
                    data-testid="button-save-integration"
                  >
                    {createIntegrationMutation.isPending ? "Connecting..." : "Connect"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
