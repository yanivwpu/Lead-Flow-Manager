import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@/lib/subscription-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { 
  Plug, Plus, Trash2, Copy, Check, ExternalLink, Zap, Lock,
  ShoppingCart, FileSpreadsheet, Users, CreditCard, Building2, Home,
  Webhook, Eye, EyeOff, RefreshCw
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

const NATIVE_INTEGRATIONS = [
  { id: "shopify", name: "Shopify", icon: ShoppingCart, description: "Sync orders and customers", color: "bg-green-500", comingSoon: true },
  { id: "google_sheets", name: "Google Sheets", icon: FileSpreadsheet, description: "Export leads to spreadsheets", color: "bg-emerald-500", comingSoon: true },
  { id: "hubspot", name: "HubSpot", icon: Users, description: "Bi-directional CRM sync", color: "bg-orange-500", comingSoon: true },
  { id: "salesforce", name: "Salesforce", icon: Building2, description: "Enterprise CRM integration", color: "bg-blue-500", comingSoon: true },
  { id: "stripe", name: "Stripe", icon: CreditCard, description: "Payment notifications", color: "bg-purple-500", comingSoon: true },
  { id: "showcase_idx", name: "Showcase IDX", icon: Home, description: "Real estate lead sync", color: "bg-red-500", comingSoon: true },
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

export function Integrations() {
  const { data: subscription, isLoading: subLoading } = useSubscription();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showSecret, setShowSecret] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [newWebhook, setNewWebhook] = useState({
    name: "",
    url: "",
    events: [] as string[],
  });

  const integrationsEnabled = subscription?.limits?.integrationsEnabled;
  const maxWebhooks = (subscription?.limits as any)?.maxWebhooks || 0;

  const { data: webhooks = [], isLoading } = useQuery<Webhook[]>({
    queryKey: ["/api/webhooks"],
    enabled: !!integrationsEnabled,
  });

  const createWebhookMutation = useMutation({
    mutationFn: async (data: { name: string; url: string; events: string[] }) => {
      return apiRequest("POST", "/api/webhooks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      setIsDialogOpen(false);
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

        <Tabs defaultValue="webhooks" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="webhooks" data-testid="tab-webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Webhooks
            </TabsTrigger>
            <TabsTrigger value="native" data-testid="tab-native">
              <Plug className="h-4 w-4 mr-2" />
              Native Integrations
            </TabsTrigger>
          </TabsList>

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
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button 
                        size="sm" 
                        className="bg-brand-green hover:bg-brand-green/90"
                        disabled={webhooks.length >= maxWebhooks}
                        data-testid="button-add-webhook"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Webhook
                      </Button>
                    </DialogTrigger>
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
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
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
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
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

          <TabsContent value="native" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {NATIVE_INTEGRATIONS.map((integration) => (
                <Card key={integration.id} className="relative overflow-hidden" data-testid={`integration-card-${integration.id}`}>
                  {integration.comingSoon && (
                    <div className="absolute top-2 right-2">
                      <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
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
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full" 
                      disabled={integration.comingSoon}
                      data-testid={`button-connect-${integration.id}`}
                    >
                      {integration.comingSoon ? "Coming Soon" : "Connect"}
                      {!integration.comingSoon && <ExternalLink className="h-3 w-3 ml-2" />}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardContent className="py-6 text-center">
                <p className="text-gray-500 text-sm">
                  Need a specific integration? Use webhooks to connect with any app via Zapier or Make.com, 
                  or <a href="mailto:support@whachatcrm.com" className="text-brand-green hover:underline">contact us</a> to request a native integration.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
