/**
 * Explicitly invoked, ONE-STORE production operator. Not imported by the app,
 * worker, cron, HTTP routes or startup. Build output: dist/shopify-offline-operator.cjs.
 *
 * --preflight is read-only. The `--convert` command requires an additional exact
 * acknowledgement and is the only code path that invokes the irreversible
 * legacy-token exchange. Never print tokens, raw API responses or SQL errors.
 */
import { sql } from "drizzle-orm";
import {
  assertOfflineTokenStorage,
  offlineTokenDatabase,
  OFFLINE_REF_PREFIX,
} from "../server/shopifyOfflineTokens";
import { offlineGraphqlClient } from "../server/shopifyAdminClient";
import { migrateAuthorizedLegacyInstallation } from "../server/shopifyOfflineMigration";
import { ShopifyTokenError } from "../server/shopifyOfflineGrant";

const SHOP = "whachatcrm-live-test.myshopify.com" as const;
const OWNER = "51f64011-eb3a-48a4-bb10-031abd3c0cdc" as const;
const EXPECTED_ENVIRONMENT = "fa2e8c30-72ea-4688-877f-4a68e24198bc" as const;
const EXPECTED_SERVICE = "a7b75139-5bf8-4a02-b4ab-b7d12e17e770" as const;
const ACK = "--acknowledge-invalidate-legacy";
const IDENTITY_QUERY = `query WhachatOfflinePilotIdentity {
  shop { myshopifyDomain }
  currentAppInstallation { app { apiKey } accessScopes { handle } }
}`;

class SafeStop extends Error {
  constructor(public code: string) { super(code); }
}

function logSafe(result: Record<string, unknown>) {
  console.log(JSON.stringify({ pilot: SHOP, ...result }));
}

function validateTargetEnvironment() {
  if (process.env.RAILWAY_ENVIRONMENT_ID !== EXPECTED_ENVIRONMENT ||
      process.env.RAILWAY_SERVICE_ID !== EXPECTED_SERVICE ||
      process.env.NODE_ENV !== "production") {
    throw new SafeStop("wrong_environment_or_service");
  }
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET)
    throw new SafeStop("shopify_app_configuration_missing");
}

/** No provider mutations, token exchanges, payment, cart, or customer messages. */
async function preflight(): Promise<"ready" | "already_migrated"> {
  validateTargetEnvironment();
  await assertOfflineTokenStorage(); // Also validates the 64-hex encryption key.
  const db = await offlineTokenDatabase();
  const owner = await db.execute(sql`SELECT id,shopify_access_token FROM users
    WHERE id=${OWNER} AND shopify_shop=${SHOP} AND shopify_access_token IS NOT NULL
    AND deletion_requested_at IS NULL
    AND LOWER(COALESCE(shopify_subscription_status,'')) NOT IN ('uninstalled','redacted')`);
  if (owner.rows.length !== 1) throw new SafeStop("pilot_ownership_invalid");
  const allOwners = await db.execute(sql`SELECT COUNT(*)::int AS count FROM users
    WHERE shopify_shop=${SHOP} AND shopify_access_token IS NOT NULL`);
  if (Number(allOwners.rows[0]?.count) !== 1) throw new SafeStop("ambiguous_shop_ownership");
  const active = await db.execute(sql`SELECT COUNT(*)::int AS count FROM integrations
    WHERE user_id=${OWNER} AND type='shopify' AND is_active=true
    AND COALESCE(config->>'shopUrl',config->>'shop',${SHOP})=${SHOP}`);
  if (Number(active.rows[0]?.count) !== 1) throw new SafeStop("pilot_integration_invalid");
  const token = String(owner.rows[0].shopify_access_token);
  if (token.startsWith(OFFLINE_REF_PREFIX)) return "already_migrated";
  const attempts = await db.execute(sql`SELECT user_id FROM shopify_offline_migration_attempts WHERE shop=${SHOP}`);
  if (attempts.rows.length !== 0) throw new SafeStop("previous_attempt_requires_manual_review");
  const existing = await db.execute(sql`SELECT user_id FROM shopify_offline_tokens WHERE shop=${SHOP} OR user_id=${OWNER}`);
  if (existing.rows.length !== 0) throw new SafeStop("existing_pair_requires_manual_review");
  // The stored legacy token must belong to the configured production Shopify app.
  // A different app client ID is a STOP, not a reason to overwrite credentials.
  let data: any;
  try {
    const response = await offlineGraphqlClient(SHOP, token).request(IDENTITY_QUERY);
    data = response?.data;
  } catch {
    throw new SafeStop("provider_identity_unavailable");
  }
  if (data?.shop?.myshopifyDomain !== SHOP ||
      data?.currentAppInstallation?.app?.apiKey !== process.env.SHOPIFY_API_KEY ||
      !Array.isArray(data?.currentAppInstallation?.accessScopes)) {
    throw new SafeStop("provider_app_or_shop_identity_unverified");
  }
  return "ready";
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.length === 1 && args[0] === "--preflight";
  const convert = args.length === 2 && args[0] === "--convert" && args[1] === ACK;
  if (!check && !convert) {
    logSafe({ status: "blocked", code: "usage_preflight_or_explicit_conversion_only" });
    process.exitCode = 2;
    return;
  }
  try {
    const readiness = await preflight();
    if (check) {
      logSafe({ status: readiness });
      return;
    }
    if (readiness !== "ready") {
      logSafe({ status: readiness, converted: false });
      return;
    }
    // Only after Shopify app identity and owner/shop checks: this invalidates the
    // original single-store legacy Admin token. No retries on ambiguity.
    const result = await migrateAuthorizedLegacyInstallation({
      userId: OWNER,
      shop: SHOP,
      expectedAppClientId: process.env.SHOPIFY_API_KEY!,
      acknowledgement: "invalidate-only-this-authorized-store-legacy-token",
    });
    if (result.status !== "migrated") throw new SafeStop("conversion_status_unexpected");
    const db = await offlineTokenDatabase();
    const verification = await db.execute(sql`SELECT status,access_expires_at,refresh_expires_at
      FROM shopify_offline_tokens WHERE shop=${SHOP} AND user_id=${OWNER}`);
    const row = verification.rows[0];
    logSafe({
      status: row?.status === "active" ? "converted_pair_stored" : "conversion_requires_review",
      encryptedPairPresent: verification.rows.length === 1,
      accessExpiry: row?.access_expires_at ?? null,
      refreshExpiry: row?.refresh_expires_at ?? null,
    });
    if (row?.status !== "active") process.exitCode = 1;
  } catch (error) {
    const code = error instanceof SafeStop ? error.code
      : error instanceof ShopifyTokenError ? "shopify_token_" + error.code
      : "operator_unavailable";
    logSafe({ status: "blocked", code });
    process.exitCode = 1;
  }
}
void main();
