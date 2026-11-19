import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("startup Shopify webhook audit cannot send deprecated offline tokens", () => {
  const src = readFileSync("server/shopifyWebhookHealth.ts", "utf8");
  assert.match(src, /like\(users\.shopifyAccessToken,\s* \`\$\{OFFLINE_REF_PREFIX\}%\`\)/);
  assert.match(src, /isNull\(users\.deletionRequestedAt\)/);
  assert.match(src, /runShopifyWebhookStartupAudit/);
});

test("ordinary Shopify Admin SDK and HTTP requests must refuse legacy tokens", () => {
  const resolver = readFileSync("server/shopifyOfflineTokens.ts", "utf8");
  const admin = readFileSync("server/shopifyAdminClient.ts", "utf8");
  assert.match(resolver, /if \(!ref\.startsWith\(OFFLINE_REF_PREFIX\)\) \{[\s\S]*?throw new ShopifyTokenError\('reauthorization_required'\)/);
  assert.doesNotMatch(resolver, /return\s+\{\s*token:\s*ref\s*\}/);
  assert.match(admin, /resolve: resolveOfflineAccessToken/);
  assert.match(admin, /headers\.set\('X-Shopify-Access-Token', await resolve\(target\.hostname, ref\)\)/);
  assert.match(admin, /const token = await deps\.resolve\(shop, ref\)/);
  const maintenance = readFileSync("server/shopifyOfflineTokenMaintenance.ts", "utf8");
  assert.match(maintenance, /FROM shopify_offline_tokens/);
  assert.doesNotMatch(maintenance, /shopify_access_token.*NOT LIKE/);
});
