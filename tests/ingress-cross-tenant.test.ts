/**
 * Cross-tenant webhook binding (WooCommerce, Calendly, Telegram, TikTok, admin token).
 * Run: npx tsx tests/ingress-cross-tenant.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import crypto from "crypto";
import { verifyWooCommerceWebhookSignature } from "../server/woocommerceWebhook";
import { verifyCalendlyWebhookSignature } from "../server/calendlyWebhook";
import { timingSafeStringEqual } from "../shared/timingSafeEqual";
import { computeAdminToken } from "../server/adminAuth";

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const body = Buffer.from(JSON.stringify({ id: 9, userId: ACCOUNT_B }), "utf8");

{
  const secretA = "woo-secret-a";
  const secretB = "woo-secret-b";
  const sigA = crypto.createHmac("sha256", secretA).update(body).digest("base64");
  assert.equal(verifyWooCommerceWebhookSignature(body, sigA, secretA), true);
  assert.equal(verifyWooCommerceWebhookSignature(body, sigA, secretB), false);
  assert.equal(verifyWooCommerceWebhookSignature(body, undefined, secretA), false);
  const wooSrc = readFileSync(join(process.cwd(), "server/woocommerceWebhook.ts"), "utf8");
  assert.match(wooSrc, /req\.params\.userId/);
  assert.match(wooSrc, /getIntegrationByUserAndType\(userId, "woocommerce"\)/);
  assert.doesNotMatch(wooSrc.slice(wooSrc.indexOf("handleWooCommerceWebhook"), wooSrc.indexOf("handleWooCommerceWebhook") + 800), /body\.userId/);
}

{
  const keyA = "cal-key-a";
  const keyB = "cal-key-b";
  const ts = "1710000000";
  const signed = `${ts}.${body.toString("utf8")}`;
  const v1 = crypto.createHmac("sha256", keyA).update(signed).digest("hex");
  const header = `t=${ts},v1=${v1}`;
  assert.equal(verifyCalendlyWebhookSignature(body, header, keyA), true);
  assert.equal(verifyCalendlyWebhookSignature(body, header, keyB), false);
  const prev = process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS;
  delete process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS;
  const calSrc = readFileSync(join(process.cwd(), "server/calendlyWebhook.ts"), "utf8");
  assert.match(calSrc, /req\.params\.userId/);
  assert.match(calSrc, /getIntegrationByUserAndType\(userId, "calendly"\)/);
  assert.match(calSrc, /CALENDLY_ALLOW_UNSIGNED_WEBHOOKS/);
  const unsignedBlock = calSrc.slice(
    calSrc.indexOf("unsignedFallbackAccepted"),
    calSrc.indexOf("unsignedFallbackAccepted") + 500,
  );
  assert.match(unsignedBlock, /=== "true"/);
  if (prev === undefined) delete process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS;
  else process.env.CALENDLY_ALLOW_UNSIGNED_WEBHOOKS = prev;
}

{
  const tg = readFileSync(join(process.cwd(), "server/ingressPublicTokens.ts"), "utf8");
  assert.match(tg, /timingSafeStringEqual/);
  assert.match(tg, /telegramWebhookPublicId/);
  assert.match(tg, /tiktokLeadPublicId/);
  assert.doesNotMatch(tg, /body\.userId/);
  const hooks = readFileSync(join(process.cwd(), "server/routes/webhooks.ts"), "utf8");
  assert.match(hooks, /resolveTelegramWebhookOwner/);
  assert.match(hooks, /resolveTiktokLeadOwner/);
  assert.match(hooks, /404/);
  const tiktokHandler = hooks.slice(hooks.indexOf("tiktok/lead/:publicId"), hooks.indexOf("tiktok/lead/:publicId") + 1200);
  assert.doesNotMatch(tiktokHandler, /const \{ userId/);
  assert.ok(ACCOUNT_A !== ACCOUNT_B);
}

{
  const tokenA = computeAdminToken("hash-a");
  const tokenB = computeAdminToken("hash-b");
  assert.equal(timingSafeStringEqual(tokenA, tokenA), true);
  assert.equal(timingSafeStringEqual(tokenA, tokenB), false);
  const admin = readFileSync(join(process.cwd(), "server/adminAuth.ts"), "utf8");
  assert.match(admin, /timingSafeStringEqual/);
  assert.doesNotMatch(admin, /console\.(log|info|debug).*adminToken/);
  assert.doesNotMatch(admin, /console\.(log|info|debug).*token/);
  const indexSrc = readFileSync(join(process.cwd(), "server/index.ts"), "utf8");
  assert.match(indexSrc, /app\.use\("\/admin\/queues", requireSalesAdmin/);
}

console.log("ingress-cross-tenant.test.ts: all assertions passed");
