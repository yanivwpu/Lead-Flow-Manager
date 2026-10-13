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
    requiredScopes: ["read_customers"],
    requiresProtectedCustomerData: true,
  },
  {
    topic: "ORDERS_CREATE",
    restTopic: "orders/create",
    pathSuffix: "/api/shopify/webhooks/orders-create",
    label: "Order created",
    required: true,
    requiredScopes: ["read_orders"],
    requiresProtectedCustomerData: true,
  },
];

/** App-level update and compliance webhooks configured in shopify.app.whachatcrm.toml (not per-shop GraphQL). */
export const SHOPIFY_APP_CONFIG_WEBHOOK_SPECS = [
  {
    topic: "customers/update",
    pathSuffix: "/api/shopify/webhooks/customers-update",
    label: "Customer updated (app config)",
  },
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

/** Commerce webhooks declared in shopify.app.whachatcrm.toml (app-level + per-shop GraphQL on install). */
export const SHOPIFY_APP_TOML_COMMERCE_WEBHOOK_SPECS = [
  {
    topic: "customers/update",
    pathSuffix: "/api/shopify/webhooks/customers-update",
    label: "Customer updated (app config)",
  },
  {
    topic: "customers/create",
    pathSuffix: "/api/shopify/webhooks/customers-create",
    label: "Customer created (app config)",
  },
  {
    topic: "orders/create",
    pathSuffix: "/api/shopify/webhooks/orders-create",
    label: "Order created (app config)",
  },
] as const;

export const SHOPIFY_ORDERS_CREATE_SCOPE = "read_orders";

export type ShopifyWebhookItemStatus =
  | "registered"
  | "missing"
  | "wrong_url"
  | "blocked_scope"
  | "app_config"
  | "permissions_unknown"
  | "registration_unknown"
  | "blocked_shopify"
  | "protected_data_unconfirmed";

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

export type ShopifyWebhookRegistrationAttempt = {
  topic: string;
  address: string;
  status:
    | "registered"
    | "already_registered"
    | "failed"
    | "skipped_verification"
    | "skipped_scope"
    | "skipped_protected_data";
  message?: string;
};

export type ShopifyOrdersCreateRegistrationBlockedReason =
  | "none"
  | "missing_scope"
  | "protected_customer_data"
  | "registration_failed"
  | "not_attempted"
  | "permissions_unknown"
  | "registration_unknown";

export type ShopifyOrdersCreateAudit = {
  requiredScopes: string[];
  oauthScopesRequested: string[];
  grantedScopes: string[];
  missingGrantedScopes: string[];
  hasReadOrders: boolean;
  requiresProtectedCustomerData: boolean;
  canRegister: boolean;
  protectedCustomerDataApprovalRequired: boolean;
  registrationBlockedReason: ShopifyOrdersCreateRegistrationBlockedReason;
  note: string;
};

export type ShopifyWebhookHealthReport = {
  shop: string;
  host: string;
  configured: boolean;
  permissionVerification: "verified" | "unknown";
  missingScopes: string[];
  unknownScopes: string[];
  protectedCustomerData: { approval: "reported"; reportedApprovalDate: string; liveConfirmation: "not_confirmed" };
  recommendedAction: string;
  failedRegistrations: ShopifyWebhookRegistrationAttempt[];
  oauthScopesRequested: string[];
  grantedScopes: string[];
  webhooks: ShopifyWebhookHealthItem[];
  ordersCreateAudit: ShopifyOrdersCreateAudit;
  summary: {
    healthy: boolean;
    status: "Healthy" | "Action Required" | "Verification Unavailable";
    missingRequired: number;
    missingOptional: number;
    blockedByScope: number;
    wrongUrl: number;
  };
};

export type ShopifyShopWebhookSummary = {
  userId: string;
  email: string | null;
  shop: string;
  healthy: boolean;
  status?: "Healthy" | "Action Required" | "Verification Unavailable";
  report?: ShopifyWebhookHealthReport;
  missingRequired: number;
  missingOptional: number;
  blockedByScope: number;
  error?: string;
};

export type ShopifyScopeVerification =
  | { status: "verified"; grantedScopes: string[] }
  | { status: "unknown"; grantedScopes: []; reason: string };
