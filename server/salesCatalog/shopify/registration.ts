import { and, eq, sql } from "drizzle-orm";
import { catalogSources } from "@shared/schema";
import {
  SHOPIFY_APP_CONFIG_WEBHOOK_SPECS,
  SHOPIFY_APP_TOML_COMMERCE_WEBHOOK_SPECS,
  type ShopifyGraphqlWebhookSpec,
  type ShopifyWebhookRegistrationAttempt,
} from "@shared/shopifyWebhookHealth";
import { registerVerifiedShopWebhooks } from "../../shopifyWebhookRegistration";
import {
  assertCatalogInstallation,
  type resolveCatalogInstallation,
} from "./installation";
import type { CatalogDb } from "../commerceStore";
export const CATALOG_APP_MANAGED_TOPICS = [
  ...new Set([
    ...SHOPIFY_APP_CONFIG_WEBHOOK_SPECS.map((s) => s.topic),
    ...SHOPIFY_APP_TOML_COMMERCE_WEBHOOK_SPECS.map((s) => s.topic),
    "app/scopes_update",
  ]),
];
export const CATALOG_SHOP_WEBHOOK_SPECS: ShopifyGraphqlWebhookSpec[] = [
  "products/create",
  "products/update",
  "products/delete",
  "inventory_levels/update",
  "inventory_levels/connect",
  "inventory_levels/disconnect",
  "inventory_items/update",
  "collections/create",
  "collections/update",
  "collections/delete",
].map((restTopic) => ({
  topic: restTopic.toUpperCase().replaceAll("/", "_"),
  restTopic,
  pathSuffix: `/api/shopify/catalog-webhooks/${restTopic.replaceAll("/", "-")}`,
  label: restTopic,
  required: false,
  requiredScopes: [
    restTopic.startsWith("inventory_levels/")
      ? "read_inventory"
      : "read_products",
  ],
}));
export type CatalogWebhookState = {
  scopesKey: string;
  cursor: number;
  nextCheckAt: string;
  completedAt?: string;
  statuses: Record<string, ShopifyWebhookRegistrationAttempt["status"]>;
};
type Installation = NonNullable<
  Awaited<ReturnType<typeof resolveCatalogInstallation>>
>;
export type CatalogWebhookRegistrar = (input: {
  install: Installation;
  sourceId: string;
  leaseToken: string;
  scopes: string[];
  state?: CatalogWebhookState;
}) => Promise<{
  state: CatalogWebhookState;
  didWork: boolean;
  delayMs: number;
}>;
type Client = { request: (query: string, options?: any) => Promise<any> };
/** One topic per leased worker chunk. Uses the existing verified read/create/read-back registrar. */
export function createCatalogWebhookRegistrar(
  database: CatalogDb,
  clientFor: (shop: string, token: string) => Client,
  host: string,
): CatalogWebhookRegistrar {
  return async ({ install, sourceId, leaseToken, scopes, state: previous }) => {
    const origin = new URL(host);
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw Error("invalid_catalog_callback_origin");
    async function guard(tx: CatalogDb) {
      await assertCatalogInstallation(tx, install);
      const [owned] = await tx
        .select({ id: catalogSources.id })
        .from(catalogSources)
        .where(
          and(
            eq(catalogSources.id, sourceId),
            eq(catalogSources.userId, install.userId),
            eq(catalogSources.integrationId, install.integrationId),
            eq(catalogSources.shop, install.shop),
            eq(catalogSources.provider, "shopify"),
            eq(catalogSources.leaseToken, leaseToken),
            sql`${catalogSources.leaseExpiresAt}>NOW()`,
            sql`${catalogSources.status}<>'disconnected'`,
          ),
        )
        .for("update")
        .limit(1);
      if (!owned) throw Error("catalog_registration_lease_lost");
    }
    const scopesKey = [...scopes].sort().join(",");
    const state: CatalogWebhookState =
      previous?.scopesKey === scopesKey
        ? { ...previous, statuses: { ...previous.statuses } }
        : {
            scopesKey,
            cursor: 0,
            nextCheckAt: new Date().toISOString(),
            statuses: {},
          };
    if (Date.parse(state.nextCheckAt) > Date.now())
      return { state, didWork: false, delayMs: 0 };
    const spec = CATALOG_SHOP_WEBHOOK_SPECS[state.cursor];
    if (!spec) throw Error("invalid_webhook_checkpoint");
    let delayMs = 0;
    let quotaBlocked = false;
    await database.transaction((tx) => guard(tx));
    const actual = clientFor(install.shop, install.token);
    const client: Client = {
      request: async (q, opts) => {
        if (quotaBlocked) throw Error("catalog_registration_quota_pause");
        try {
          const response = await actual.request(q, { ...opts, retries: 0 });
          const throttle = response.extensions?.cost?.throttleStatus;
          if (throttle?.currentlyAvailable < 300) {
            quotaBlocked = true;
            delayMs = Math.max(
              delayMs,
              1000,
              Math.ceil(
                ((300 - throttle.currentlyAvailable) /
                  Math.max(1, throttle.restoreRate ?? 50)) *
                  1000,
              ),
            );
          }
          const errors = response.errors?.graphQLErrors ?? response.errors;
          if (
            Array.isArray(errors) &&
            errors.some((e: any) => e.extensions?.code === "THROTTLED")
          ) {
            quotaBlocked = true;
            delayMs = Math.max(delayMs, 60_000);
          }
          return response;
        } catch (error: any) {
          if (
            error?.response?.code === 429 ||
            JSON.stringify(
              error?.response?.errors?.graphQLErrors ?? [],
            ).includes("THROTTLED")
          ) {
            quotaBlocked = true;
            delayMs = Math.max(delayMs, 60_000);
          }
          throw error;
        }
      },
    };
    const [result] = await registerVerifiedShopWebhooks({
      getClient: () => client,
      host: origin.origin,
      requestedScopes: [],
      specs: [spec],
      appManagedTopics: CATALOG_APP_MANAGED_TOPICS,
      maxSubscriptionPages: 2,
      mutate: (operation) =>
        database.transaction(async (tx) => {
          // Hold the existing shop advisory fence across the bounded mutation, including uninstall races.
          await guard(tx);
          return operation();
        }),
    });
    state.statuses[spec.restTopic] = result.status;
    const failed = ![
      "registered",
      "already_registered",
      "skipped_scope",
    ].includes(result.status);
    if (!failed) state.cursor++;
    if (state.cursor === CATALOG_SHOP_WEBHOOK_SPECS.length) {
      state.cursor = 0;
      state.completedAt = new Date().toISOString();
      state.nextCheckAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    } else
      state.nextCheckAt = new Date(
        Date.now() + (failed ? 5 * 60_000 : delayMs),
      ).toISOString();
    return { state, didWork: true, delayMs };
  };
}
