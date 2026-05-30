/** Per-shop webhooks registered via Admin GraphQL on OAuth install. */
export type ShopifyGraphqlWebhookSpec = {
  topic: string;
  restTopic: string;
  pathSuffix: string;
  label: string;
  required: boolean;
  requiredScopes?: string[];
  requiresProtectedCustomerData?: boolean;
};

export const SHOPIFY_GRAPHQL_WEBHOOK_SPECS: ShopifyGraphqlWebhookSpec[] = [
  {
    topic: "APP_UNINSTALLED",
    restTopic: "app/uninstalled",
    pathSuffix: "/api/shopify/webhooks/app-uninstalled",
    label: "App uninstalled",
    required: true,
  },
  {
    topic: "CUSTOMERS_CREATE",
    restTopic: "customers/create",
    pathSuffix: "/api/shopify/webhooks/customers-create",
    label: "Customer created",
    required: true,
  },
  {
    topic: "ORDERS_CREATE",
    restTopic: "orders/create",
    pathSuffix: "/api/shopify/webhooks/orders-create",
    label: "Order created",
    required: false,
    requiredScopes: ["read_orders"],
    requiresProtectedCustomerData: true,
  },
];

/** App-level compliance webhooks configured in shopify.app.whachatcrm.toml (not per-shop GraphQL). */
export const SHOPIFY_APP_CONFIG_WEBHOOK_SPECS = [
  {
    topic: "customers/data_request",
    pathSuffix: "/api/shopify/webhooks/customers/data_request",
    label: "Customer data request (GDPR)",
  },
  {
    topic: "customers/redact",
    pathSuffix: "/api/shopify/webhooks/customers/redact",
    label: "Customer redact (GDPR)",
  },
  {
    topic: "shop/redact",
    pathSuffix: "/api/shopify/webhooks/shop/redact",
    label: "Shop redact (GDPR)",
  },
] as const;

export const SHOPIFY_ORDERS_CREATE_SCOPE = "read_orders";

export type ShopifyWebhookItemStatus =
  | "registered"
  | "missing"
  | "wrong_url"
  | "blocked_scope"
  | "app_config";

export type ShopifyWebhookHealthItem = {
  topic: string;
  restTopic: string;
  label: string;
  expectedCallbackUrl: string;
  registeredCallbackUrl: string | null;
  status: ShopifyWebhookItemStatus;
  required: boolean;
  registrationMethod: "graphql" | "app_toml";
  scopeNotes: string | null;
};

export type ShopifyOrdersCreateAudit = {
  requiredScopes: string[];
  grantedScopes: string[];
  hasReadOrders: boolean;
  requiresProtectedCustomerData: boolean;
  canRegister: boolean;
  note: string;
};

export type ShopifyWebhookHealthReport = {
  shop: string;
  host: string;
  configured: boolean;
  grantedScopes: string[];
  webhooks: ShopifyWebhookHealthItem[];
  ordersCreateAudit: ShopifyOrdersCreateAudit;
  summary: {
    healthy: boolean;
    missingRequired: number;
    missingOptional: number;
    blockedByScope: number;
    wrongUrl: number;
  };
};

export type ShopifyWebhookRegistrationAttempt = {
  topic: string;
  address: string;
  status: "registered" | "already_registered" | "failed" | "skipped_scope";
  message?: string;
};

export type ShopifyShopWebhookSummary = {
  userId: string;
  email: string | null;
  shop: string;
  healthy: boolean;
  missingRequired: number;
  missingOptional: number;
  blockedByScope: number;
  error?: string;
};
