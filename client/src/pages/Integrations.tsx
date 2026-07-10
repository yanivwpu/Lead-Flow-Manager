import { useState, useEffect, useRef } from "react";
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
  Webhook, Eye, EyeOff, RefreshCw,
  Calendar, Mail, Link2
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  CRM_INTEGRATION_LABEL,
  CRM_INSTALL_CTA,
  CRM_MARKETPLACE_CTA,
  CRM_RECONNECT_OAUTH_CTA,
  CRM_INSTALLED_NOT_CONNECTED,
} from "@shared/leadConnectorWhiteLabel";
import { ShopifyManagePanel } from "@/components/integrations/ShopifyManagePanel";

function integrationBrandLogoLetter(name: string) {
  const c = name.trim().charAt(0);
  if (c && /[A-Za-z0-9]/.test(c)) return c.toUpperCase();
  return "?";
}

/** Normalizes store URL to origin (scheme + host) for WooCommerce admin / REST URLs. */
function normalizeWooStoreUrlInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let withProto = trimmed;
  if (!/^https?:\/\//i.test(withProto)) {
    withProto = `https://${withProto}`;
  }
  try {
    const u = new URL(withProto);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`.replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Static brand marks under client/public/logos — same-origin only. */
const INTEGRATION_LOGO_BY_ID: Record<string, string> = {
  shopify: "/logos/shopify.svg",
  stripe: "/logos/stripe.svg",
  hubspot: "/logos/hubspot.svg",
  salesforce: "/logos/salesforce.svg",
  google_sheets: "/logos/google-sheets.svg",
  calendly: "/logos/calendly.svg",
  slack: "/logos/slack.svg",
  woocommerce: "/logos/woocommerce.svg",
  mailchimp: "/logos/mailchimp.svg",
  showcase_idx: "/logos/showcase-idx.svg",
};

function IntegrationBrandLogo({
  name,
  logoUrl,
  integrationId,
  className,
}: {
  name: string;
  logoUrl?: string;
  /** Optional id for integration-specific in-box scale (does not change layout). */
  integrationId?: string;
  className?: string;
}) {
  const letter = integrationBrandLogoLetter(name);
  if (integrationId === "leadconnector") {
    return (
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50",
          className,
        )}
        aria-hidden
      >
        <Link2 className="h-5 w-5 text-indigo-600" />
      </div>
    );
  }
  const strongSizeBoost = integrationId === "salesforce";
  const imgSizeClass = strongSizeBoost
    ? "max-h-[115%] max-w-[115%] origin-center scale-[1.2]"
    : "max-h-full max-w-full";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-100 bg-white",
        strongSizeBoost && "overflow-visible",
        className,
      )}
      aria-hidden
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt=""
          className={cn("box-border object-contain object-center", imgSizeClass)}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="text-base font-semibold leading-none text-gray-700">{letter}</span>
      )}
    </div>
  );
}

function CalendlyTokenInstructions() {
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">How to create your Calendly token</p>
          <p className="mt-1 text-xs leading-relaxed text-blue-900/90">
            Open Calendly, create a Personal Access Token, select the required access, then paste the token below.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 shrink-0 border-blue-200 bg-white text-blue-700">
          <a href={CALENDLY_PAT_URL} target="_blank" rel="noreferrer">
            Open Calendly
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
      <ol className="mt-3 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-blue-900">
        <li>Go to Calendly → Integrations & Apps → API access.</li>
        <li>Create a Personal Access Token.</li>
        <li>Select required scopes before copying the token.</li>
      </ol>
      <div className="mt-3 rounded-md bg-white/80 p-3">
        <p className="text-xs font-medium text-blue-950">Required access</p>
        <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-blue-900">
          <li>Scheduling access</li>
          <li>Booking sync access</li>
          <li>
            <code className="rounded bg-blue-100 px-1 py-0.5">organizations:read</code>
          </li>
        </ul>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-blue-900/90">
        WhachatCRM will validate the token, read your organization and event types, then set up booking sync automatically.
      </p>
    </div>
  );
}

const WEBHOOK_EVENTS = [
  { id: "new_chat", label: "New Conversation", description: "When a new chat is created" },
  { id: "message_received", label: "Message Received", description: "When an inbound message arrives" },
  { id: "message_sent", label: "Message Sent", description: "When an outbound message is sent" },
  { id: "tag_changed", label: "Tag Changed", description: "When a chat's tag is updated" },
  { id: "pipeline_changed", label: "Pipeline Stage Changed", description: "When a deal moves stages" },
  { id: "followup_due", label: "Follow-up Due", description: "When a follow-up reminder is triggered" },
  { id: "chat_assigned", label: "Chat Assigned", description: "When a chat is assigned to a team member" },
];

type IntegrationCategory = "crm" | "commerce" | "scheduling" | "marketing" | "industry";

interface IntegrationConfig {
  id: string;
  name: string;
  icon: any;
  description: string;
  color: string;
  category: IntegrationCategory;
  /** Single-line summary on marketplace cards */
  tagline: string;
  fields: { key: string; label: string; placeholder: string; type?: string; helpText?: string }[];
  syncOptions?: {
    id: string;
    label: string;
    description: string;
    comingSoon?: boolean;
    required?: boolean;
  }[];
}

const CATEGORY_SECTIONS: { key: IntegrationCategory; title: string }[] = [
  { key: "crm", title: "CRM & Sales" },
  { key: "commerce", title: "Commerce & Revenue" },
  { key: "scheduling", title: "Scheduling & Ops" },
  { key: "marketing", title: "Marketing" },
  { key: "industry", title: "Industry-specific" },
];

type CrmMarketplaceInstallConfig = {
  configured: boolean;
  installUrl: string | null;
  oauthAuthorizeUrl?: string;
  oauthReconnectUrl?: string;
  error: string | null;
};

type CrmUnlinkedInstall = {
  id: string;
  locationId: string | null;
  companyId: string;
  subAccountName: string | null;
  agency: string | null;
};

type CrmConnectionStatus = {
  connected: boolean;
  tokenExpired?: boolean;
  marketplaceInstalled?: boolean;
  installedInGhlNotConnected?: boolean;
  unlinkedMarketplaceInstalls?: CrmUnlinkedInstall[];
  locationId?: string;
  companyId?: string;
  installedAt?: string;
};

const VITE_SHOPIFY_APP_STORE_URL =
  typeof import.meta.env.VITE_SHOPIFY_APP_STORE_URL === "string"
    ? import.meta.env.VITE_SHOPIFY_APP_STORE_URL.trim()
    : "";
const VITE_SHOPIFY_MANUAL_INSTALL_URL =
  typeof import.meta.env.VITE_SHOPIFY_MANUAL_INSTALL_URL === "string"
    ? import.meta.env.VITE_SHOPIFY_MANUAL_INSTALL_URL.trim()
    : "";

const CALENDLY_PAT_URL = "https://calendly.com/integrations/api_webhooks";

const NATIVE_INTEGRATIONS: IntegrationConfig[] = [
  { 
    id: "leadconnector", 
    name: CRM_INTEGRATION_LABEL, 
    icon: Link2, 
    description: "Connect your CRM account to sync leads and activity", 
    color: "bg-indigo-600",
    category: "crm",
    tagline: "Sync leads & activity with your CRM",
    fields: [],
    syncOptions: [
      { id: "sync_contacts", label: "Sync Contacts", description: "Keep leads synced between platforms" },
      { id: "sync_opportunities", label: "Sync Opportunities", description: "Sync deal and opportunity updates" },
    ]
  },
  { 
    id: "shopify", 
    name: "Shopify", 
    icon: ShoppingCart, 
    description: "Auto-create leads from new orders and customers", 
    color: "bg-green-500",
    category: "commerce",
    tagline: "Orders, customers & abandoned carts",
    fields: [],
    syncOptions: [
      { id: "new_orders", label: "New Orders", description: "Create a chat when a new order is placed" },
      { id: "abandoned_carts", label: "Abandoned Carts", description: "Create a chat for abandoned checkouts" },
      { id: "new_customers", label: "New Customers", description: "Create a chat when a customer signs up" },
    ]
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    icon: ShoppingCart,
    description:
      "Connect your WooCommerce store to sync customers, orders, and automate WhatsApp follow-ups.",
    color: "bg-violet-700",
    category: "commerce",
    tagline: "Customers, orders & WhatsApp follow-ups",
    fields: [],
    syncOptions: [
      { id: "new_orders", label: "New Orders", description: "Create a chat when a new order is placed" },
      { id: "new_customers", label: "New Customers", description: "Create a chat when a new customer is created" },
      { id: "order_updates", label: "Order updates", description: "Notify on order status changes" },
    ],
  },
  { 
    id: "google_sheets", 
    name: "Google Sheets", 
    icon: FileSpreadsheet, 
    description: "Export leads and conversations to spreadsheets", 
    color: "bg-emerald-500",
    category: "scheduling",
    tagline: "Export leads & conversations to Sheets",
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
    description: "Sync WhachatCRM leads to HubSpot contacts. Token is validated on connect and stored encrypted.",
    color: "bg-orange-500",
    category: "crm",
    tagline: "HubSpot contact sync",
    fields: [
      { key: "accessToken", label: "Private App Access Token", placeholder: "pat-na1-xxxxx", type: "password", helpText: "HubSpot → Settings → Integrations → Private Apps. Scopes: crm.objects.contacts.read and crm.objects.contacts.write. Optional: create contact properties whachat_pipeline_stage and whachat_tag to map pipeline and tags." },
    ],
  },
  { 
    id: "salesforce", 
    name: "Salesforce", 
    icon: Building2, 
    description: "Enterprise CRM integration for leads and opportunities", 
    color: "bg-blue-500",
    category: "crm",
    tagline: "Enterprise CRM leads & opportunities",
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
    category: "commerce",
    tagline: "Payments, customers & subscriptions",
    fields: [
      { key: "secretKey", label: "Secret Key", placeholder: "sk_live_xxxxx", type: "password", helpText: "Found in Stripe Dashboard > Developers > API keys" },
      { key: "webhookSecret", label: "Event Signing Secret", placeholder: "whsec_xxxxx", type: "password", helpText: "From Stripe event settings" },
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
    description: "Lead and activity sync only — not listing inventory", 
    color: "bg-red-500",
    category: "industry",
    tagline: "Leads & activity (no listing sync)",
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
    category: "scheduling",
    tagline: "Meetings booked, cancellations & reschedules",
    fields: [
      {
        key: "accessToken",
        label: "Personal Access Token",
        placeholder: "eyJraWQiOiIxY...",
        type: "password",
        helpText: "Create this in Calendly from Integrations & Apps > API access. Select scheduling, booking sync, and organizations:read access.",
      },
    ],
    syncOptions: [
      { id: "new_bookings", label: "New Bookings", description: "Create a chat when someone books a meeting" },
      { id: "cancellations", label: "Cancellations", description: "Notify when meetings are cancelled" },
      { id: "reschedules", label: "Reschedules", description: "Update chat when meetings are rescheduled" },
    ]
  },
  { 
    id: "mailchimp", 
    name: "Mailchimp", 
    icon: Mail, 
    description: "Sync contacts to email lists and trigger campaigns", 
    color: "bg-yellow-500",
    category: "marketing",
    tagline: "Audiences, tags & automations",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "xxxxxxxx-us21", type: "password", helpText: "Found in Mailchimp > Account > Extras > API keys" },
      { key: "serverPrefix", label: "Server Prefix", placeholder: "us21", helpText: "The 'usX' at the end of your API key (e.g., us21)" },
      { key: "audienceId", label: "Audience ID", placeholder: "a1b2c3d4e5", helpText: "Found in Audience > Settings > Audience name and defaults" },
    ],
    syncOptions: [
      { id: "sync_contacts", label: "Sync Contacts", description: "Add WhatsApp contacts to your Mailchimp audience" },
      { id: "tag_subscribers", label: "Tag Subscribers", description: "Apply tags based on chat pipeline stages" },
      { id: "trigger_automations", label: "Trigger Automations", description: "Start email sequences when chats reach certain stages" },
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
          "Install WhachatCRM from the Shopify App Store",
          "Approve permissions in your Shopify admin",
          "Customers and orders sync automatically when connected",
        ];
      case 'calendly':
        return [
          "Click Connect and paste your Personal Access Token",
          "WhachatCRM sets up booking sync with Calendly for you",
          "Bookings, cancellations, and reschedules sync to the inbox automatically",
        ];
      case 'stripe':
        return [
          "Go to Stripe Dashboard → Developers → Events",
          "Click 'Add endpoint'",
          "Paste the connection URL above",
          "Select events: checkout.session.completed, payment_intent.succeeded",
          "Click 'Add endpoint'"
        ];
      case 'hubspot':
        return [
          "Inbound HubSpot event sync is not used in this version.",
          "Use Connect with a Private App token; we validate it against HubSpot before saving.",
          "Open Manage → Sync now to push contacts to HubSpot.",
        ];
      default:
        return ["Configure the connection URL in your service"];
    }
  };
  
  if (!user) return null;
  
  return (
    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-600">Connection URL</span>
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
  const [showShopifyInfo, setShowShopifyInfo] = useState(false);
  type ShopifyListingState = "checking" | "live" | "unavailable";
  const [shopifyListingState, setShopifyListingState] = useState<ShopifyListingState>("unavailable");
  const [showWooCommerceInfo, setShowWooCommerceInfo] = useState(false);
  const [wooForm, setWooForm] = useState({ storeUrl: "", consumerKey: "", consumerSecret: "" });
  const [wooError, setWooError] = useState<string | null>(null);
  const [wooSuccess, setWooSuccess] = useState(false);
  const [wooOrderHint, setWooOrderHint] = useState<string | null>(null);
  const wooStoreUrlInputRef = useRef<HTMLInputElement>(null);
  const [checkingLcConnection, setCheckingLcConnection] = useState(false);
  const [reconnectingCrm, setReconnectingCrm] = useState(false);
  const [selectedReconnectInstallId, setSelectedReconnectInstallId] = useState<string | null>(null);
  const [manageIntegrationId, setManageIntegrationId] = useState<string | null>(null);
  const [pendingDisconnectType, setPendingDisconnectType] = useState<string | null>(null);
  const [leadManageOpen, setLeadManageOpen] = useState(false);

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

  const lcLocationId = integrations.find((i) => i.type === "gohighlevel")?.config?.locationId as
    | string
    | undefined;

  const {
    data: lcStatus,
    isFetching: lcStatusFetching,
    isError: lcStatusError,
    refetch: refetchLcStatus,
  } = useQuery<CrmConnectionStatus>({
    queryKey: ["/api/ext/connection-status", lcLocationId ?? ""],
    queryFn: async () => {
      const params = lcLocationId ? `?locationId=${encodeURIComponent(lcLocationId)}` : "";
      const res = await fetch(`/api/ext/connection-status${params}`, { credentials: "include" });
      if (!res.ok) {
        const snippet = (await res.text().catch(() => "")).slice(0, 200);
        console.warn("[CRM Integration] /api/ext/connection-status failed:", res.status, snippet);
        return { connected: false, tokenExpired: false, marketplaceInstalled: false, installedInGhlNotConnected: false };
      }
      return res.json() as Promise<CrmConnectionStatus>;
    },
    enabled: !!integrationsEnabled,
    placeholderData: { connected: false, tokenExpired: false, marketplaceInstalled: false, installedInGhlNotConnected: false },
  });

  const {
    data: crmInstallConfig,
    isFetching: crmInstallConfigFetching,
    refetch: refetchCrmInstallConfig,
  } = useQuery<CrmMarketplaceInstallConfig>({
    queryKey: ["/api/ext/marketplace-install"],
    queryFn: async () => {
      const res = await fetch("/api/ext/marketplace-install", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as CrmMarketplaceInstallConfig;
      if (!res.ok) {
        return {
          configured: false,
          installUrl: null,
          error: data.error || "CRM install is not available right now.",
        };
      }
      return data;
    },
    enabled: !!integrationsEnabled,
    staleTime: 60_000,
  });

  const startCrmOAuthAuthorize = () => {
    const authorizeUrl = crmInstallConfig?.oauthAuthorizeUrl || "/api/ext/oauth-authorize";
    window.location.href = authorizeUrl;
  };

  const reconnectCrmOAuth = async (install?: CrmUnlinkedInstall) => {
    setReconnectingCrm(true);
    try {
      const res = await fetch(crmInstallConfig?.oauthReconnectUrl || "/api/ext/oauth-reconnect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locationId: install?.locationId || undefined,
          companyId: install?.companyId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
        locationId?: string | null;
        unlinkedInstalls?: CrmUnlinkedInstall[];
      };

      if (!res.ok) {
        if (data.unlinkedInstalls?.length) {
          toast({
            title: "Select a CRM location",
            description: data.error || "Choose which installed CRM location to reconnect.",
            variant: "destructive",
          });
          return;
        }
        toast({
          title: "Reconnect failed",
          description: data.error || "Could not reconnect CRM OAuth tokens. Try authorizing again.",
          variant: "destructive",
        });
        return;
      }

      await Promise.all([
        refetchLcStatus(),
        queryClient.invalidateQueries({ queryKey: ["/api/integrations"] }),
      ]);
      toast({
        title: "CRM connected",
        description: data.locationId
          ? `OAuth tokens saved for location ${data.locationId}.`
          : "OAuth tokens saved to your WhachatCRM account.",
      });
    } catch {
      toast({
        title: "Reconnect failed",
        description: "Could not reconnect CRM OAuth tokens. Please try again.",
        variant: "destructive",
      });
    } finally {
      setReconnectingCrm(false);
    }
  };

  const handleCrmPrimaryAction = async () => {
    const installs = lcStatus?.unlinkedMarketplaceInstalls || [];
    const selected =
      installs.find((row) => row.id === selectedReconnectInstallId) ||
      (installs.length === 1 ? installs[0] : undefined);

    if (!selected && installs.length > 1) {
      toast({
        title: "Select a CRM location",
        description: "Choose which installed CRM location to reconnect OAuth tokens for.",
        variant: "destructive",
      });
      return;
    }

    if (selected || lcStatus?.tokenExpired || lcStatus?.installedInGhlNotConnected) {
      await reconnectCrmOAuth(
        selected ||
          (lcStatus?.locationId || lcStatus?.companyId
            ? {
                id: "current",
                locationId: lcStatus.locationId ?? null,
                companyId: lcStatus.companyId || "",
                subAccountName: null,
                agency: null,
              }
            : undefined),
      );
      return;
    }

    startCrmOAuthAuthorize();
  };

  const openCrmMarketplace = async () => {
    let config = crmInstallConfig;
    if (!config || !config.configured) {
      const refreshed = await refetchCrmInstallConfig();
      config = refreshed.data;
    }
    if (config?.configured && config.installUrl) {
      window.open(config.installUrl, "_blank", "noopener,noreferrer");
      return;
    }
    toast({
      title: "CRM install unavailable",
      description:
        config?.error ||
        "The CRM marketplace app is not configured on the server. Set GHL_CLIENT_ID and GHL_APP_VERSION_ID, then try again.",
      variant: "destructive",
    });
  };

  const {
    data: shopifyStatus,
    isFetching: shopifyStatusFetching,
  } = useQuery<{ connected: boolean; shop: string | null; syncEnabled: boolean; integrationId: string | null }>({
    queryKey: ["/api/shopify/connection-status"],
    queryFn: async () => {
      const res = await fetch("/api/shopify/connection-status", { credentials: "include" });
      if (!res.ok) {
        return { connected: false, shop: null, syncEnabled: false, integrationId: null };
      }
      return res.json();
    },
    enabled: !!integrationsEnabled,
    staleTime: 30_000,
  });

  const shopifyConnected = !!shopifyStatus?.connected;

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
      const res = await apiRequest("POST", "/api/integrations", data);
      return res.json() as Promise<Record<string, unknown>>;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setConnectingIntegration(null);
      setIntegrationForm({});
      setSelectedSyncOptions([]);
      const types = data?.calendlyEventTypes as string[] | undefined;
      if (data?.type === "calendly" && data?.message === "Existing Calendly webhook found and linked.") {
        toast({
          title: "Existing Calendly webhook linked",
          description: "Existing Calendly webhook found and linked.",
        });
      } else if (data?.type === "calendly" && data?.calendlyWebhookStatus === "failed") {
        toast({
          title: "Calendly connected",
          description:
            typeof data?.calendlySyncMessage === "string"
              ? data.calendlySyncMessage
              : "Booking link is connected. Booking confirmations will sync by polling.",
        });
      } else if (data?.type === "calendly" && data?.calendlySyncMode === "polling") {
        toast({
          title: "Calendly connected",
          description: "Booking link is connected. Booking confirmations will sync by polling.",
        });
      } else if (Array.isArray(types) && types.length > 0) {
        toast({
          title: "Calendly connected",
          description: `Event types: ${types.slice(0, 5).join(", ")}${types.length > 5 ? "…" : ""}`,
        });
      }
      if (data?.type === "hubspot") {
        toast({
          title: "HubSpot connected",
          description: "Token validated. Use Manage → Sync now to push contacts.",
        });
      }
    },
    onError: (err: Error) => {
      let description = err.message || "Could not save integration";
      const brace = description.indexOf("{");
      if (brace >= 0) {
        try {
          const parsed = JSON.parse(description.slice(brace)) as { error?: string; errorCode?: string };
          if (typeof parsed.error === "string") description = parsed.error;
          if (parsed.errorCode === "missing_scopes") {
            description =
              "Your Calendly token is missing required access. Create a new token with scheduling, booking sync, and organizations:read access.";
          } else if (parsed.errorCode === "invalid_token") {
            description = "Calendly could not validate this token. Copy a fresh Personal Access Token from Calendly.";
          } else if (parsed.errorCode === "organization_not_found") {
            description = "Calendly validated the token, but no organization was found. Make sure organizations:read is selected.";
          }
        } catch {
          /* keep full message */
        }
      }
      toast({
        title: "Connection couldn't be completed",
        description,
        variant: "destructive",
      });
    },
  });

  const toggleIntegrationMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/integrations/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/connection-status"] });
    },
  });

  const deleteIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/integrations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/shopify/connection-status"] });
      toast({
        title: pendingDisconnectType === "calendly" ? "Calendly disconnected" : "Integration disconnected",
        description:
          pendingDisconnectType === "calendly"
            ? "Calendly token, booking link state, and booking sync connection were removed."
            : "The integration has been removed.",
      });
      setManageIntegrationId(null);
      setPendingDisconnectType(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Disconnect couldn't finish",
        description: err.message || "Could not disconnect integration. Please try again.",
        variant: "destructive",
      });
      setPendingDisconnectType(null);
    },
  });

  const syncIntegrationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/integrations/${id}/sync`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
        details?: string;
        lastHubSpotSync?: Record<string, unknown>;
        calendlySyncMode?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || data.message || `Sync could not finish (${res.status})`);
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      const partial = data.success === false;
      const linkedExistingCalendlyWebhook = data.message === "Existing Calendly webhook found and linked.";
      const calendlyPollingSync = data.calendlySyncMode === "polling";
      const title = linkedExistingCalendlyWebhook
        ? "Existing Calendly webhook linked"
        : calendlyPollingSync
          ? "Bookings synced"
          : partial
            ? "Sync finished with issues"
            : "Sync complete";
      const description =
        (linkedExistingCalendlyWebhook && typeof data.message === "string" ? data.message : "") ||
        (typeof data.details === "string" && data.details) ||
        (typeof data.message === "string" && data.message) ||
        "Integration sync finished.";
      toast({
        title,
        description,
        variant: partial ? "destructive" : "default",
      });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({
        title: "Sync couldn't finish",
        description: err.message || "Could not sync integration. Please try again.",
        variant: "destructive",
      });
    },
  });

  const wooConnectMutation = useMutation({
    mutationFn: async (body: { storeUrl: string; consumerKey: string; consumerSecret: string }) => {
      const res = await fetch("/api/integrations/woocommerce/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        sampleOrders?: { id: number }[];
      };
      if (!res.ok) {
        throw new Error(data.error || "Connection could not be completed");
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      setWooSuccess(true);
      setWooError(null);
      const n = data?.sampleOrders?.length ?? 0;
      setWooOrderHint(
        n > 0 ? `Fetched ${n} recent order${n === 1 ? "" : "s"} from your store (read test).` : null,
      );
    },
    onError: (err: Error) => {
      setWooSuccess(false);
      setWooError(err.message);
    },
  });

  useEffect(() => {
    if (!wooSuccess || !showWooCommerceInfo) return;
    const t = window.setTimeout(() => {
      setShowWooCommerceInfo(false);
      setWooSuccess(false);
      setWooOrderHint(null);
      setWooForm({ storeUrl: "", consumerKey: "", consumerSecret: "" });
      setWooError(null);
      wooConnectMutation.reset();
    }, 2000);
    return () => window.clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only close timer on success + modal open
  }, [wooSuccess, showWooCommerceInfo]);

  useEffect(() => {
    if (!showShopifyInfo) return;

    if (!VITE_SHOPIFY_APP_STORE_URL) {
      setShopifyListingState("unavailable");
      return;
    }

    setShopifyListingState("checking");
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/shopify/listing-check?target=${encodeURIComponent(VITE_SHOPIFY_APP_STORE_URL)}`,
          { credentials: "include" },
        );
        const data = (await res.json().catch(() => ({ available: false }))) as { available?: boolean };
        if (cancelled) return;
        setShopifyListingState(data.available ? "live" : "unavailable");
      } catch {
        if (!cancelled) setShopifyListingState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showShopifyInfo]);

  const openShopifyUrl = (raw: string) => {
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("bad proto");
      window.open(u.href, "_blank", "noopener,noreferrer");
    } catch {
      toast({
        title: "Invalid link",
        description: "Configure a full URL starting with https:// in your environment variables.",
        variant: "destructive",
      });
    }
  };

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
    setSelectedSyncOptions((prev) =>
      prev.includes(optionId) ? prev.filter((o) => o !== optionId) : [...prev, optionId]
    );
  };

  const handleConnectIntegration = () => {
    if (!connectingIntegration) return;
    const syncOptions =
      connectingIntegration.id === "hubspot"
        ? ["sync_contacts"]
        : selectedSyncOptions;
    createIntegrationMutation.mutate({
      type: connectingIntegration.id,
      name: connectingIntegration.name,
      config: { ...integrationForm, syncOptions },
    });
  };

  const handleCheckLcConnection = async () => {
    setCheckingLcConnection(true);
    try {
      const result = await refetchLcStatus();
      const data = result.data;
      if (data?.connected) {
        toast({ title: "Connected", description: "CRM integration is connected with valid OAuth tokens." });
      } else if (data?.tokenExpired) {
        toast({ title: "Token Expired", description: "Your CRM OAuth token has expired. Use Reconnect OAuth.", variant: "destructive" });
      } else if (data?.installedInGhlNotConnected) {
        toast({
          title: "Installed in GHL only",
          description: CRM_INSTALLED_NOT_CONNECTED,
          variant: "destructive",
        });
      } else {
        toast({ title: "Not Connected", description: "No CRM integration with OAuth tokens found. Connect CRM to authorize.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Could not check connection status. Please try again.", variant: "destructive" });
    } finally {
      setCheckingLcConnection(false);
    }
  };

  const handleDisconnectIntegration = (integrationId: string, integrationName: string, integrationType: string) => {
    const confirmed = window.confirm(
      integrationType === "calendly"
        ? "Disconnect Calendly? This removes the saved token, clears the booking link connection, and attempts to remove booking sync."
        : `Disconnect ${integrationName}? This removes the saved integration credentials.`
    );
    if (!confirmed) return;
    setPendingDisconnectType(integrationType);
    deleteIntegrationMutation.mutate(integrationId);
  };

  const getConnectedIntegration = (type: string) => {
    if (type === "leadconnector") {
      return integrations.find((i) => i.type === "gohighlevel");
    }
    return integrations.find((i) => i.type === type);
  };

  const managingIntegration = manageIntegrationId
    ? NATIVE_INTEGRATIONS.find((i) => i.id === manageIntegrationId)
    : undefined;
  const managingConnected = manageIntegrationId
    ? getConnectedIntegration(manageIntegrationId)
    : undefined;

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
          Connect WhachatCRM with your favorite tools like Shopify, CRM platforms, HubSpot, Salesforce, and more. 
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
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6 max-w-7xl mx-auto pb-20">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Integrations</h1>
            <p className="text-sm text-gray-500 mt-1">Connect tools your team already uses</p>
          </div>
        </div>

        <Tabs defaultValue="native" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="native" data-testid="tab-native">
              <Plug className="h-4 w-4 mr-2" />
              Native Integrations
            </TabsTrigger>
            <TabsTrigger value="webhooks" data-testid="tab-webhooks">
              <Webhook className="h-4 w-4 mr-2" />
              Connections
            </TabsTrigger>
          </TabsList>

          <TabsContent value="native" className="space-y-12">
            {CATEGORY_SECTIONS.map(({ key, title }) => {
              const items = NATIVE_INTEGRATIONS.filter((i) => i.category === key);
              if (items.length === 0) return null;
              return (
                <section key={key} className="space-y-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {items.map((integration) => {
                      const connected = getConnectedIntegration(integration.id);
                      const isLeadConnector = integration.id === "leadconnector";
                      const lcConnected = !!lcStatus?.connected;
                      const lcInstalledNotConnected = !!lcStatus?.installedInGhlNotConnected && !lcConnected;
                      const lcNeedsReconnect = !lcConnected && (!!lcStatus?.tokenExpired || lcInstalledNotConnected);
                      const lcUnlinkedInstalls = lcStatus?.unlinkedMarketplaceInstalls || [];
                      const wooConnected = integration.id === "woocommerce" && !!connected;
                      const calendlyConnected = integration.id === "calendly" && !!connected;
                      const shopifyManageConnected = integration.id === "shopify" && shopifyConnected;
                      const hubspotValidated =
                        integration.id === "hubspot" &&
                        !!connected &&
                        (connected.config as Record<string, unknown>)?.connectionStatus === "connected";

                      let primaryLabel = "Connect";
                      let primaryDisabled = false;
                      let primaryAction: () => void = () => {
                        setConnectingIntegration(integration);
                        setIntegrationForm({});
                        setSelectedSyncOptions(integration.id === "hubspot" ? ["sync_contacts"] : []);
                      };
                      let primaryTestId = `button-connect-${integration.id}`;

                      if (isLeadConnector) {
                        primaryTestId = lcConnected
                          ? "button-manage-leadconnector"
                          : lcNeedsReconnect
                            ? "button-reconnect-leadconnector"
                            : "button-install-leadconnector";
                        if (lcStatusFetching || reconnectingCrm) {
                          primaryDisabled = true;
                          primaryLabel = lcNeedsReconnect ? CRM_RECONNECT_OAUTH_CTA : CRM_INSTALL_CTA;
                        } else if (lcConnected) {
                          primaryLabel = "Manage";
                          primaryAction = () => setLeadManageOpen(true);
                        } else if (lcNeedsReconnect) {
                          primaryLabel = CRM_RECONNECT_OAUTH_CTA;
                          primaryAction = () => void handleCrmPrimaryAction();
                        } else {
                          primaryLabel = CRM_INSTALL_CTA;
                          primaryAction = () => startCrmOAuthAuthorize();
                        }
                      } else if (wooConnected) {
                        primaryLabel = "Connected";
                        primaryDisabled = true;
                        primaryTestId = "button-woocommerce-connected";
                        primaryAction = () => {};
                      } else if (calendlyConnected) {
                        primaryLabel = "Manage";
                        primaryTestId = "button-calendly-connected";
                        primaryAction = () => setManageIntegrationId(integration.id);
                      } else if (shopifyManageConnected) {
                        primaryLabel = "Manage";
                        primaryTestId = "button-manage-shopify";
                        primaryAction = () => setManageIntegrationId(integration.id);
                      } else if (connected && integration.id !== "shopify") {
                        primaryLabel = "Manage";
                        primaryTestId = `button-manage-${integration.id}`;
                        primaryAction = () => setManageIntegrationId(integration.id);
                      } else if (integration.id === "shopify") {
                        primaryAction = () => {
                          setShopifyListingState(
                            VITE_SHOPIFY_APP_STORE_URL ? "checking" : "unavailable"
                          );
                          setShowShopifyInfo(true);
                        };
                      } else if (integration.id === "woocommerce") {
                        primaryAction = () => setShowWooCommerceInfo(true);
                      }

                      return (
                        <div
                          key={integration.id}
                          className="flex h-full min-h-[200px] flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                          data-testid={`integration-card-${integration.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <IntegrationBrandLogo
                              name={integration.name}
                              logoUrl={INTEGRATION_LOGO_BY_ID[integration.id]}
                              integrationId={integration.id}
                            />
                            <div className="min-w-0 flex-1 flex items-center gap-2">
                              <h3 className="text-sm font-semibold leading-snug text-gray-900">{integration.name}</h3>
                              {(wooConnected ||
                                calendlyConnected ||
                                shopifyManageConnected ||
                                hubspotValidated ||
                                (isLeadConnector && lcConnected)) && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-emerald-200 bg-emerald-50 text-[10px] font-semibold uppercase tracking-wide text-emerald-800"
                                >
                                  Connected
                                </Badge>
                              )}
                              {isLeadConnector && lcInstalledNotConnected && (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-amber-200 bg-amber-50 text-[10px] font-semibold uppercase tracking-wide text-amber-900"
                                >
                                  Needs OAuth
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="mt-3 flex-1 text-sm leading-snug text-gray-500 line-clamp-1">
                            {integration.tagline}
                          </p>
                          <div className="mt-5 space-y-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full border-gray-200 bg-white font-medium text-gray-900 shadow-none hover:bg-gray-50"
                              disabled={primaryDisabled}
                              onClick={primaryAction}
                              data-testid={primaryTestId}
                            >
                              {lcStatusFetching && isLeadConnector ? (
                                <span className="inline-flex items-center gap-2">
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                  Loading…
                                </span>
                              ) : reconnectingCrm && isLeadConnector ? (
                                <span className="inline-flex items-center gap-2">
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                  Reconnecting…
                                </span>
                              ) : shopifyStatusFetching && integration.id === "shopify" ? (
                                <span className="inline-flex items-center gap-2">
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-gray-400" />
                                  Loading…
                                </span>
                              ) : wooConnected ? (
                                <span className="inline-flex items-center justify-center gap-1.5 text-emerald-800">
                                  <Check className="h-3.5 w-3.5" aria-hidden />
                                  Connected
                                </span>
                              ) : (
                                primaryLabel
                              )}
                            </Button>
                            {wooConnected && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-auto w-full py-1 text-xs text-gray-600 hover:text-gray-900"
                                onClick={() => setManageIntegrationId(integration.id)}
                                data-testid={`button-${integration.id}-manage`}
                              >
                                Manage integration
                              </Button>
                            )}
                            {isLeadConnector && lcInstalledNotConnected && (
                              <p className="text-xs text-amber-900" role="alert">
                                {CRM_INSTALLED_NOT_CONNECTED}
                              </p>
                            )}
                            {isLeadConnector && lcInstalledNotConnected && lcUnlinkedInstalls.length > 1 && (
                              <Select
                                value={selectedReconnectInstallId || undefined}
                                onValueChange={setSelectedReconnectInstallId}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select CRM location to reconnect" />
                                </SelectTrigger>
                                <SelectContent>
                                  {lcUnlinkedInstalls.map((row) => (
                                    <SelectItem key={row.id} value={row.id}>
                                      {row.subAccountName || row.agency || row.locationId || row.companyId}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                            {isLeadConnector && lcStatusError && (
                              <p className="text-xs text-amber-800" role="alert">
                                Could not verify connection with the server. You can still open the marketplace to
                                install or manage your CRM integration.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <div className="rounded-xl border border-gray-200 bg-gray-50/50 px-6 py-8 text-center">
              <p className="text-sm text-gray-500">
                Need a specific integration? Connect with Zapier, Make.com, or{" "}
                <a href="/contact" className="text-gray-900 underline underline-offset-2 hover:text-gray-700">
                  contact us
                </a>{" "}
                to request a native integration.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Workflow Connections</CardTitle>
                    <CardDescription>
                      Share selected WhachatCRM events with tools like Zapier, Make.com, or your own apps
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
                    Add Connection
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
                    <p className="font-medium">No workflow connections yet</p>
                    <p className="text-sm">Create a connection to share selected events with another tool</p>
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
                                Needs retry
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
                      {webhooks.length} of {maxWebhooks} workflow connections used
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">How Workflow Connections Work</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-600 space-y-3">
                <p>
                  Workflow connections let WhachatCRM share selected events with your other applications when something important happens.
                </p>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-gray-900">Quick setup with Zapier:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600">
                    <li>Create a new Zap in Zapier</li>
                    <li>Choose the Zapier trigger that receives app events</li>
                    <li>Copy the connection URL from Zapier</li>
                    <li>Paste the URL here and select your events</li>
                  </ol>
                </div>
                <p className="text-xs text-gray-500">
                  Advanced users can verify each event with the included signature header.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Workflow connection dialog */}
        <Dialog open={isWebhookDialogOpen} onOpenChange={setIsWebhookDialogOpen}>
          <DialogContent className="max-w-md h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 overflow-hidden">
            <DialogHeader className="flex-shrink-0 p-6 pb-2">
              <DialogTitle>Create Workflow Connection</DialogTitle>
              <DialogDescription>
                Choose which events to send to another tool.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto space-y-4 p-6 pt-2">
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
                <Label htmlFor="webhook-url">Connection URL</Label>
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
            <DialogFooter className="flex-shrink-0 border-t p-6 mt-0">
              <Button variant="outline" onClick={() => setIsWebhookDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createWebhookMutation.mutate(newWebhook)}
                disabled={!newWebhook.name || !newWebhook.url || newWebhook.events.length === 0 || createWebhookMutation.isPending}
                className="bg-brand-green hover:bg-brand-green/90"
                data-testid="button-save-webhook"
              >
                {createWebhookMutation.isPending ? "Creating..." : "Create Connection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Shopify OAuth Install Dialog */}
        <Dialog open={showShopifyInfo} onOpenChange={setShowShopifyInfo}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <IntegrationBrandLogo
                  name="Shopify"
                  logoUrl={INTEGRATION_LOGO_BY_ID.shopify}
                  integrationId="shopify"
                />
                <div>
                  <DialogTitle>Install WhachatCRM on Shopify</DialogTitle>
                  <DialogDescription>
  Shopify apps are installed directly from Shopify.
  Once installed, your store will automatically connect to WhachatCRM.
</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 space-y-1">
                <p className="font-medium">Transparent Pricing:</p>
                <p className="text-xs">WhachatCRM keeps billing transparent with no markup on Meta conversation pricing. Your subscription and Meta messaging charges are separate.</p>
              </div>
              {shopifyListingState === "live" ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 space-y-1">
                  <p className="font-medium">How to install:</p>
                  <ol className="list-decimal list-inside text-xs space-y-1 text-green-700">
                    <li>Open our listing on the Shopify App Store using the button below</li>
                    <li>Click &quot;Add app&quot; on the listing page</li>
                    <li>Review the permissions and approve the app in your Shopify admin</li>
                    <li>You&apos;ll be redirected back here automatically once installed</li>
                  </ol>
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900 space-y-1">
                  <p className="font-medium">App Store listing</p>
                  <p className="text-xs">
                    This app may still be in review on Shopify. Use the buttons below when{" "}
                    <span className="font-mono">VITE_SHOPIFY_APP_STORE_URL</span> or{" "}
                    <span className="font-mono">VITE_SHOPIFY_MANUAL_INSTALL_URL</span> is configured for this
                    environment.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setShowShopifyInfo(false)}>
                Close
              </Button>
              {VITE_SHOPIFY_APP_STORE_URL ? (
                <Button
                  type="button"
                  onClick={() => openShopifyUrl(VITE_SHOPIFY_APP_STORE_URL)}
                  disabled={shopifyListingState === "checking"}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  data-testid="button-shopify-app-store"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  {shopifyListingState === "checking" ? "Checking listing…" : "Go to Shopify App Store"}
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              ) : null}
              {VITE_SHOPIFY_MANUAL_INSTALL_URL ? (
                <Button
                  type="button"
                  variant={VITE_SHOPIFY_APP_STORE_URL ? "outline" : "default"}
                  onClick={() => openShopifyUrl(VITE_SHOPIFY_MANUAL_INSTALL_URL)}
                  className={
                    VITE_SHOPIFY_APP_STORE_URL
                      ? "border-green-200 text-green-800 hover:bg-green-50"
                      : "bg-green-600 hover:bg-green-700 text-white"
                  }
                  data-testid="button-shopify-manual-install"
                >
                  <ShoppingCart className="h-4 w-4 mr-2" />
                  Open manual install link
                  <ExternalLink className="h-3 w-3 ml-2" />
                </Button>
              ) : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* WooCommerce — REST API key connection */}
        <Dialog
          open={showWooCommerceInfo}
          onOpenChange={(open) => {
            setShowWooCommerceInfo(open);
            if (open) {
              setWooError(null);
              setWooSuccess(false);
              setWooOrderHint(null);
            } else {
              setWooError(null);
              setWooSuccess(false);
              setWooOrderHint(null);
              setWooForm({ storeUrl: "", consumerKey: "", consumerSecret: "" });
              wooConnectMutation.reset();
            }
          }}
        >
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <IntegrationBrandLogo
                  name="WooCommerce"
                  logoUrl={INTEGRATION_LOGO_BY_ID.woocommerce}
                  integrationId="woocommerce"
                />
                <div>
                  <DialogTitle>Connect WooCommerce</DialogTitle>
                  <DialogDescription>
                    Connect your WooCommerce store to sync customers, orders, and automate WhatsApp follow-ups.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {wooSuccess ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center text-sm text-emerald-900">
                <p className="font-semibold">Connected ✅</p>
                {wooOrderHint && <p className="mt-2 text-xs text-emerald-800">{wooOrderHint}</p>}
              </div>
            ) : (
              <form
                id="woo-connect-form"
                className="space-y-4 py-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setWooError(null);
                  wooConnectMutation.mutate({
                    storeUrl: wooForm.storeUrl.trim(),
                    consumerKey: wooForm.consumerKey.trim(),
                    consumerSecret: wooForm.consumerSecret.trim(),
                  });
                }}
              >
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950">
                  <p className="font-medium">How to get your API keys</p>
                  <ol className="mt-2 list-decimal list-inside space-y-1 text-xs text-violet-900">
                    <li>Go to your WooCommerce admin</li>
                    <li>Settings → Advanced → REST API</li>
                    <li>Click &quot;Add Key&quot;</li>
                    <li>Copy Consumer Key &amp; Consumer Secret</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="woo-store-url">Store URL</Label>
                  <Input
                    ref={wooStoreUrlInputRef}
                    id="woo-store-url"
                    required
                    autoComplete="url"
                    placeholder="https://yourstore.com"
                    value={wooForm.storeUrl}
                    onChange={(e) => setWooForm((f) => ({ ...f, storeUrl: e.target.value }))}
                    disabled={wooConnectMutation.isPending}
                    data-testid="input-woocommerce-store-url"
                  />
                  <p className="text-xs text-gray-500">
                    Enter your store URL to enable quick access to API settings
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    "w-full border-violet-200 bg-white font-medium text-violet-900 hover:bg-violet-100/80",
                    !wooForm.storeUrl.trim() && "cursor-not-allowed opacity-50",
                  )}
                  disabled={wooConnectMutation.isPending}
                  aria-disabled={!wooForm.storeUrl.trim()}
                  onClick={() => {
                    if (!wooForm.storeUrl.trim()) {
                      wooStoreUrlInputRef.current?.focus();
                      return;
                    }
                    const base = normalizeWooStoreUrlInput(wooForm.storeUrl);
                    if (!base) {
                      wooStoreUrlInputRef.current?.focus();
                      return;
                    }
                    window.open(
                      `${base}/wp-admin/admin.php?page=wc-settings&tab=advanced&section=keys`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  data-testid="button-woocommerce-open-api-settings"
                >
                  Open WooCommerce API Settings
                  <ExternalLink className="ml-2 h-3.5 w-3.5" />
                </Button>
                <div className="space-y-2">
                  <Label htmlFor="woo-consumer-key">Consumer Key</Label>
                  <Input
                    id="woo-consumer-key"
                    required
                    autoComplete="off"
                    placeholder="ck_xxxxx"
                    value={wooForm.consumerKey}
                    onChange={(e) => setWooForm((f) => ({ ...f, consumerKey: e.target.value }))}
                    disabled={wooConnectMutation.isPending}
                    data-testid="input-woocommerce-consumer-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="woo-consumer-secret">Consumer Secret</Label>
                  <Input
                    id="woo-consumer-secret"
                    required
                    type="password"
                    autoComplete="new-password"
                    placeholder="cs_xxxxx"
                    value={wooForm.consumerSecret}
                    onChange={(e) => setWooForm((f) => ({ ...f, consumerSecret: e.target.value }))}
                    disabled={wooConnectMutation.isPending}
                    data-testid="input-woocommerce-consumer-secret"
                  />
                </div>

                {wooError && (
                  <div
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                    role="alert"
                  >
                    {wooError}
                  </div>
                )}
              </form>
            )}

            <DialogFooter className="gap-2 sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowWooCommerceInfo(false)}
                disabled={wooConnectMutation.isPending}
              >
                {wooSuccess ? "Close" : "Cancel"}
              </Button>
              {!wooSuccess && (
                <Button
                  type="submit"
                  form="woo-connect-form"
                  className="bg-violet-700 hover:bg-violet-800 text-white"
                  disabled={wooConnectMutation.isPending}
                  data-testid="button-woocommerce-connect-store"
                >
                  {wooConnectMutation.isPending ? (
                    <span className="inline-flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                      Connecting…
                    </span>
                  ) : (
                    "Connect Store"
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CRM Integration — manage (install, check, verify) */}
        <Dialog open={leadManageOpen} onOpenChange={setLeadManageOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <IntegrationBrandLogo
                  name={CRM_INTEGRATION_LABEL}
                  integrationId="leadconnector"
                />
                <div>
                  <DialogTitle>{CRM_INTEGRATION_LABEL}</DialogTitle>
                  <DialogDescription>Install the app from the Marketplace and verify your connection</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="space-y-3 pt-1">
              {!crmInstallConfig?.configured && !crmInstallConfigFetching ? (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  role="alert"
                >
                  {crmInstallConfig?.error ||
                    "CRM marketplace install is not configured. Contact support before installing."}
                </div>
              ) : null}
              {lcStatus?.installedInGhlNotConnected && !lcStatus?.connected ? (
                <div
                  className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                  role="alert"
                >
                  {CRM_INSTALLED_NOT_CONNECTED}
                </div>
              ) : null}
              {!lcStatus?.connected ? (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full font-medium"
                  onClick={() => void handleCrmPrimaryAction()}
                  disabled={crmInstallConfigFetching || reconnectingCrm}
                  data-testid="button-reconnect-leadconnector-dialog"
                >
                  {reconnectingCrm ? (
                    <>
                      <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                      Reconnecting OAuth…
                    </>
                  ) : (
                    CRM_RECONNECT_OAUTH_CTA
                  )}
                </Button>
              ) : null}
              {!lcStatus?.connected ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-gray-200 font-medium"
                  onClick={startCrmOAuthAuthorize}
                  disabled={crmInstallConfigFetching || reconnectingCrm}
                  data-testid="button-oauth-authorize-leadconnector-dialog"
                >
                  Authorize in CRM (OAuth)
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="w-full border-gray-200 font-medium"
                onClick={() => void openCrmMarketplace()}
                disabled={crmInstallConfigFetching}
                data-testid="button-install-leadconnector-dialog"
              >
                {crmInstallConfigFetching ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-2 animate-spin" />
                    Loading install link…
                  </>
                ) : (
                  <>
                    {CRM_MARKETPLACE_CTA}
                    <ExternalLink className="h-3 w-3 ml-2" />
                  </>
                )}
              </Button>
              {!lcStatus?.connected && (
                <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <p className="text-xs text-gray-600 flex-1">
                    Reconnect OAuth saves tokens to WhachatCRM. Use Authorize if GHL still shows the app as installed.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 text-xs h-8"
                    onClick={handleCheckLcConnection}
                    disabled={checkingLcConnection}
                    data-testid="button-check-leadconnector-connection"
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${checkingLcConnection ? "animate-spin" : ""}`} />
                    {checkingLcConnection ? "Checking…" : "Check"}
                  </Button>
                </div>
              )}
              {lcStatus?.connected && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-gray-200"
                  onClick={handleCheckLcConnection}
                  disabled={checkingLcConnection}
                  data-testid="button-verify-leadconnector"
                >
                  <RefreshCw className={`h-3 w-3 mr-1 ${checkingLcConnection ? "animate-spin" : ""}`} />
                  {checkingLcConnection ? "Verifying…" : "Verify connection"}
                </Button>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Native integration — manage connected account */}
        <Dialog open={manageIntegrationId !== null} onOpenChange={(open) => !open && setManageIntegrationId(null)}>
          <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[88vh] overflow-y-auto p-4 sm:p-6">
            {managingIntegration && (managingIntegration.id === "shopify" || managingConnected) && (
              <>
                <DialogHeader>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <IntegrationBrandLogo
                      name={managingIntegration.name}
                      logoUrl={INTEGRATION_LOGO_BY_ID[managingIntegration.id]}
                    />
                    <div className="min-w-0">
                      <DialogTitle>{managingIntegration.name}</DialogTitle>
                      <DialogDescription>{managingIntegration.description}</DialogDescription>
                      {managingIntegration.id === "woocommerce" &&
                        managingConnected &&
                        typeof (managingConnected.config as Record<string, unknown>)?.storeUrl === "string" && (
                          <p className="mt-1 text-xs text-gray-600">
                            Store:{" "}
                            <span className="font-medium text-gray-800">
                              {(managingConnected.config as Record<string, string>).storeUrl}
                            </span>
                          </p>
                        )}
                    </div>
                  </div>
                </DialogHeader>
                {managingIntegration.id === "shopify" ? (
                  <div className="pt-2">
                    <ShopifyManagePanel
                      onConnect={() => {
                        setManageIntegrationId(null);
                        setShopifyListingState(
                          VITE_SHOPIFY_APP_STORE_URL ? "checking" : "unavailable",
                        );
                        setShowShopifyInfo(true);
                      }}
                      onDisconnect={(integrationId) =>
                        handleDisconnectIntegration(integrationId, managingIntegration.name, managingIntegration.id)
                      }
                      disconnectPending={deleteIntegrationMutation.isPending}
                      onToggleSync={(integrationId, isActive) =>
                        toggleIntegrationMutation.mutate({ id: integrationId, isActive })
                      }
                      toggleSyncPending={toggleIntegrationMutation.isPending}
                    />
                  </div>
                ) : (
                managingConnected && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Sync</span>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={managingConnected.isActive}
                        onCheckedChange={(checked) =>
                          toggleIntegrationMutation.mutate({ id: managingConnected.id, isActive: checked })
                        }
                        data-testid={`switch-integration-${managingIntegration.id}`}
                      />
                      <span className={managingConnected.isActive ? "text-gray-900" : "text-gray-400"}>
                        {managingConnected.isActive ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>
                  {managingConnected.lastSyncAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Last manual sync</span>
                      <span className="text-gray-700">
                        {new Date(managingConnected.lastSyncAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  {managingIntegration.id === "hubspot" &&
                    (managingConnected.config as Record<string, unknown>)?.connectionStatus === "connected" && (
                      <div className="rounded-md border border-emerald-100 bg-emerald-50/80 p-3 text-sm space-y-1.5">
                        <p className="font-medium text-emerald-900">Auto-sync enabled</p>
                        <p className="text-xs text-emerald-900/90 leading-snug">
                          New and updated contacts are pushed to HubSpot in the background. Use Sync now for a full
                          backfill.
                        </p>
                        {typeof (managingConnected.config as Record<string, unknown>)?.lastHubSpotAutoSyncAt ===
                          "string" && (
                          <p className="text-xs text-emerald-800/90">
                            Last auto-sync:{" "}
                            <span className="font-medium">
                              {new Date(
                                (managingConnected.config as Record<string, string>).lastHubSpotAutoSyncAt
                              ).toLocaleString()}
                            </span>
                          </p>
                        )}
                        {(() => {
                          const err = (managingConnected.config as Record<string, unknown>)?.lastHubSpotAutoSyncError as
                            | { at?: string; message?: string }
                            | undefined;
                          if (!err?.message) return null;
                          return (
                            <p className="text-xs text-red-700 leading-snug" role="alert">
                              Auto-sync error
                              {err.at ? ` (${new Date(err.at).toLocaleString()})` : ""}: {err.message}
                            </p>
                          );
                        })()}
                      </div>
                    )}
                  {managingIntegration.id === "hubspot" &&
                    (() => {
                      const last = (managingConnected.config as Record<string, unknown>)?.lastHubSpotSync as
                        | {
                            summary?: string;
                            at?: string;
                            pushed?: number;
                            failed?: number;
                            skipped?: number;
                            errors?: string[];
                          }
                        | undefined;
                      if (!last?.at && !last?.summary) return null;
                      return (
                        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm space-y-1.5">
                          <p className="font-medium text-gray-900">Last manual HubSpot sync</p>
                          {last.at && (
                            <p className="text-xs text-gray-500">{new Date(last.at).toLocaleString()}</p>
                          )}
                          {last.summary && <p className="text-gray-800">{last.summary}</p>}
                          {Array.isArray(last.errors) && last.errors.length > 0 && (
                            <ul className="list-disc pl-4 text-xs text-red-700 space-y-0.5 max-h-32 overflow-y-auto">
                              {last.errors.slice(0, 12).map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })()}
                  {managingIntegration.id === "hubspot" &&
                    (managingConnected.config as Record<string, unknown>)?.connectionStatus !== "connected" && (
                      <p className="text-xs text-amber-800">
                        Reconnect with a valid token to enable contact sync.
                      </p>
                    )}
                  {managingIntegration.id === "calendly" &&
                    (() => {
                      const cfg = managingConnected.config as Record<string, unknown>;
                      const bookingLink =
                        typeof cfg.calendlyPrimarySchedulingUrl === "string" ? cfg.calendlyPrimarySchedulingUrl : "";
                      const webhookStatus = String(cfg.calendlyWebhookStatus || "unknown");
                      const syncMode = String(cfg.calendlySyncMode || (webhookStatus === "failed" ? "polling" : "webhook"));
                      const pollingActive = syncMode === "polling";
                      const webhookActive = syncMode === "webhook" && webhookStatus === "connected";
                      const lastPollAt =
                        typeof cfg.calendlyLastPollAt === "string" ? cfg.calendlyLastPollAt : "";
                      const accountEmail =
                        typeof cfg.calendlyUserEmail === "string" && cfg.calendlyUserEmail.trim()
                          ? cfg.calendlyUserEmail.trim()
                          : "";
                      const accountName =
                        typeof cfg.calendlyUserName === "string" && cfg.calendlyUserName.trim()
                          ? cfg.calendlyUserName.trim()
                          : "";
                      const userUri =
                        typeof cfg.calendlyUserUri === "string" && cfg.calendlyUserUri.trim()
                          ? cfg.calendlyUserUri.trim()
                          : "";
                      return (
                        <div
                          className={cn(
                            "rounded-lg border p-4 text-sm",
                            pollingActive
                              ? "border-sky-200 bg-sky-50 text-sky-950"
                              : "border-emerald-100 bg-emerald-50/80 text-emerald-900",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">Calendly connected</p>
                            <Badge
                              variant="default"
                              className={cn(
                                "text-[10px]",
                                pollingActive
                                  ? "bg-sky-600 text-white"
                                  : "bg-emerald-600 text-white",
                              )}
                            >
                              {pollingActive ? "Polling sync active" : "Real-time sync active"}
                            </Badge>
                          </div>
                          <div className="mt-3 space-y-2 text-xs sm:text-sm">
                            <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                              <span className={pollingActive ? "text-sky-800" : "text-emerald-800"}>
                                Calendly account
                              </span>
                              <span className="min-w-0 break-words font-medium sm:text-right">
                                {accountEmail || accountName || userUri || "Connected account"}
                              </span>
                            </div>
                            <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                              <span className={pollingActive ? "text-sky-800" : "text-emerald-800"}>
                                Booking sync
                              </span>
                              <span className="font-medium sm:text-right">
                                {pollingActive
                                  ? "Polling (Calendly Free / no webhooks)"
                                  : webhookActive
                                    ? "Webhooks"
                                    : webhookStatus.replace(/_/g, " ")}
                              </span>
                            </div>
                            {lastPollAt && pollingActive && (
                              <div className="grid gap-1 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
                                <span className="text-sky-800">Last sync</span>
                                <span className="font-medium sm:text-right">
                                  {new Date(lastPollAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                          {bookingLink ? (
                            <a
                              href={bookingLink}
                              target="_blank"
                              rel="noreferrer"
                              className={cn(
                                "mt-3 block break-all text-xs underline sm:text-sm",
                                pollingActive ? "text-sky-800" : "text-emerald-800",
                              )}
                            >
                              {bookingLink}
                            </a>
                          ) : (
                            <p className="mt-1">Calendly is connected, but no public booking link was detected.</p>
                          )}
                          {pollingActive && (
                            <p className="mt-2 text-xs sm:text-sm text-sky-900">
                              Booking confirmations may sync by polling every few minutes, or immediately when you use
                              Sync bookings now.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  {managingIntegration.id === "hubspot" && (
                    <p className="text-xs text-gray-400 leading-snug">
                      More advanced HubSpot features will be added in future updates.
                    </p>
                  )}
                  {["calendly", "stripe"].includes(managingIntegration.id) && (
                    <WebhookUrlDisplay integrationType={managingIntegration.id} />
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-gray-200"
                      onClick={() => syncIntegrationMutation.mutate(managingConnected.id)}
                      disabled={syncIntegrationMutation.isPending}
                      data-testid={`button-sync-${managingIntegration.id}`}
                    >
                      <RefreshCw
                        className={`h-3 w-3 mr-1 ${syncIntegrationMutation.isPending ? "animate-spin" : ""}`}
                      />
                      {managingIntegration.id === "calendly" &&
                      (managingConnected.config as Record<string, unknown>)?.calendlySyncMode === "polling"
                        ? "Sync bookings now"
                        : managingIntegration.id === "calendly" &&
                            (managingConnected.config as Record<string, unknown>)?.calendlyWebhookStatus === "failed"
                          ? "Sync bookings now"
                          : managingIntegration.id === "calendly"
                            ? "Sync Calendly"
                            : "Sync now"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-gray-200 text-gray-700 hover:bg-red-50 hover:text-red-600"
                      onClick={() =>
                        handleDisconnectIntegration(managingConnected.id, managingIntegration.name, managingIntegration.id)
                      }
                      disabled={deleteIntegrationMutation.isPending}
                      data-testid={`button-disconnect-${managingIntegration.id}`}
                    >
                      {managingIntegration.id === "calendly" ? "Disconnect Calendly" : "Disconnect"}
                    </Button>
                  </div>
                </div>
                ))}
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Integration Connection Dialog */}
        <Dialog open={!!connectingIntegration} onOpenChange={(open) => !open && setConnectingIntegration(null)}>
          <DialogContent className="max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col p-0 overflow-hidden">
            {connectingIntegration && (
              <>
                <DialogHeader className="flex-shrink-0 p-6 pb-2">
                  <div className="flex items-center gap-3">
                    <IntegrationBrandLogo
                      name={connectingIntegration.name}
                      logoUrl={INTEGRATION_LOGO_BY_ID[connectingIntegration.id]}
                      integrationId={connectingIntegration.id}
                    />
                    <div>
                      <DialogTitle>
                        {connectingIntegration.id === "hubspot"
                          ? "Connect HubSpot"
                          : `Connect ${connectingIntegration.name}`}
                      </DialogTitle>
                      <DialogDescription>
                        {connectingIntegration.id === "hubspot"
                          ? "Link your HubSpot private app to sync contacts."
                          : connectingIntegration.description}
                      </DialogDescription>
                    </div>
                  </div>
                </DialogHeader>
                <div className="flex-1 overflow-y-auto space-y-4 p-6 pt-2">
                  {connectingIntegration.id === "calendly" && <CalendlyTokenInstructions />}

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

                  {connectingIntegration.id === "hubspot" ? (
                    <>
                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/90 p-4">
                        <p className="text-sm font-medium text-gray-900">Sync contacts</p>
                        <p className="text-sm text-gray-600 leading-relaxed">
                          Automatically sync new and updated WhachatCRM leads to HubSpot contacts.
                        </p>
                        <p className="text-xs text-gray-500">Auto-sync runs in the background (~2 minutes).</p>
                      </div>
                      <p className="text-xs text-gray-400 leading-snug">
                        More advanced HubSpot features will be added in future updates.
                      </p>
                    </>
                  ) : (
                    connectingIntegration.syncOptions &&
                    connectingIntegration.syncOptions.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <Label>Sync Options</Label>
                        <div className="space-y-2 border rounded-md p-3">
                          {connectingIntegration.syncOptions.map((option) => {
                            const locked = !!option.comingSoon || !!option.required;
                            const checked = option.comingSoon
                              ? false
                              : option.required
                                ? true
                                : selectedSyncOptions.includes(option.id);
                            return (
                              <div key={option.id} className="flex items-start space-x-2">
                                <Checkbox
                                  id={`sync-${option.id}`}
                                  checked={checked}
                                  disabled={locked}
                                  onCheckedChange={() => {
                                    if (locked) return;
                                    handleSyncOptionToggle(option.id);
                                  }}
                                  data-testid={`checkbox-sync-${option.id}`}
                                />
                                <div className="grid min-w-0 flex-1 gap-0.5 leading-none">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <label
                                      htmlFor={`sync-${option.id}`}
                                      className={cn(
                                        "text-sm font-medium",
                                        locked && !option.required ? "cursor-default text-gray-500" : "cursor-pointer",
                                      )}
                                    >
                                      {option.label}
                                    </label>
                                    {option.comingSoon && (
                                      <Badge
                                        variant="secondary"
                                        className="h-5 text-[10px] font-semibold uppercase tracking-wide"
                                      >
                                        Coming soon
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500">{option.description}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </div>
                <DialogFooter className="flex-shrink-0 border-t p-6 mt-0">
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
