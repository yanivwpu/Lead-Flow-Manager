/**
 * Sales Admin conversation-count semantics + usage increment order + Email chip wiring.
 * Run: npx tsx tests/admin-conversation-usage-and-email.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  deriveActivationChannelConnections,
  isActivationChannelConnected,
  REAL_ACTIVATION_CHANNELS,
} from "../shared/adminActivationMetrics";
import { META_CUSTOMER_SERVICE_CHANNELS } from "../shared/metaConversationQuota";
import { deriveAdminEmailIndicator } from "../shared/adminChannelConnectionStatus";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function sliceBetween(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, `missing ${startNeedle}`);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(end > start, `missing ${endNeedle} after ${startNeedle}`);
  return src.slice(start, end);
}

function run(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${name}`);
}

run("A: Activation Conversations = qualifying conversation rows, not monthly usage", () => {
  assert.deepEqual([...REAL_ACTIVATION_CHANNELS], [
    "whatsapp",
    "instagram",
    "facebook",
    "shopify",
    "gohighlevel",
  ]);
  assert.ok(!REAL_ACTIVATION_CHANNELS.includes("email" as never), "email threads do not inflate Activation Conv");

  const activationSvc = read("server/adminActivationService.ts");
  assert.match(activationSvc, /inArray\(conversations\.channel, \[\.\.\.REAL_ACTIVATION_CHANNELS\]\)/);
  assert.match(activationSvc, /conversationCountMap\.get\(user\.id\)/);
  assert.doesNotMatch(activationSvc, /monthlyConversations/);

  const tab = read("client/src/components/admin/AdminActivationTab.tsx");
  assert.match(tab, /title="Conversation threads on WhatsApp, Messenger, Instagram, Shopify, and CRM \(not plan usage\)"/);
  assert.match(tab, />\s*Conversations\s*</);
  assert.match(tab, /row\.conversationsCount/);
});

run("Users table X / limit = 24-hour Meta session usage for current period", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /conversationsUsed[\s\S]{0,80}limits\?\.conversationsUsed/);
  assert.match(routes, /conversationsLimit[\s\S]{0,80}limits\?\.conversationsLimit/);

  const admin = read("client/src/pages/Admin.tsx");
  assert.match(admin, /Conversation usage/);
  assert.match(admin, /Customer-initiated 24-hour WhatsApp/);
  assert.match(admin, /\$\{used\} \/ \$\{limit\}/);
});

run("B: plan quota covers only Meta customer-service sessions", () => {
  assert.deepEqual([...META_CUSTOMER_SERVICE_CHANNELS], ["whatsapp", "facebook", "instagram"]);
  const query = read("shared/metaConversationQuota.ts");
  assert.match(query, /m.direction = 'inbound'/);
  assert.match(query, /LAG\(m.created_at\)/);
  assert.match(query, /INTERVAL '24 hours'/);
  assert.match(query, /received_at >=/);
  assert.match(query, /previous_inbound_at IS NULL/);
  assert.doesNotMatch(query, /webchat|shopify|telegram|email/);
  const fact = read("shared/publicProductFacts.ts");
  assert.match(fact, /outgoing messages, and template sends alone do not add units/);
  assert.match(fact, /Website Chat and website AI chatbot/);
});

run("C: all legacy thread-creation increments removed", () => {
  for (const file of [
    "server/routes.ts",
    "server/channelService.ts",
    "server/campaignExecution.ts",
    "server/routes/templates.ts",
  ]) {
    assert.doesNotMatch(read(file), /incrementConversationUsage\(/, file);
  }
  const subscription = read("server/subscriptionService.ts");
  assert.doesNotMatch(subscription, /storage.incrementMonthlyConversations/);
  assert.doesNotMatch(subscription, /async incrementConversationUsage\(/);
  assert.match(subscription, /countMetaCustomerServiceWindows\(/);
});

run("D: duplicate inbound provider message returns before persisted event", () => {
  const channel = read("server/channelService.ts");
  const dedupe = sliceBetween(channel, "Deduplicate: skip if this external message ID", "Inbox Worker");
  assert.match(dedupe, /getMessageByUserExternalId/);
  assert.match(dedupe, /deduped: true/);
});

run("E: email and template sends do not update plan quota", () => {
  assert.doesNotMatch(read("server/emailChannel/persistInbound.ts"), /incrementConversationUsage/);
  assert.doesNotMatch(read("server/emailChannel/sendService.ts"), /incrementConversationUsage/);
  const templates = read("server/routes/templates.ts");
  assert.doesNotMatch(templates, /incrementConversationUsage/);
  const campaign = read("server/campaignExecution.ts");
  assert.doesNotMatch(campaign, /incrementConversationUsage/);
});

run("F: the real billing-period boundaries are passed to Meta session counting", () => {
  const sub = read("server/subscriptionService.ts");
  assert.match(sub, /resolveUsagePeriodFromDates/);
  assert.match(sub, /countMetaCustomerServiceWindows\(\s*userId,\s*usagePeriod.periodStart,\s*usagePeriod.periodEnd/);
  assert.doesNotMatch(sub, /user.monthlyConversations \|\| 0/);
});

run("G–I: Gmail mailbox state drives EM; account email does not", () => {
  assert.equal(deriveAdminEmailIndicator({ syncStatus: "connected", provider: "gmail" }).state, "connected");
  assert.equal(deriveAdminEmailIndicator({ syncStatus: "disconnected", provider: "gmail" }).state, "disconnected");
  assert.equal(deriveAdminEmailIndicator(null).state, "disconnected");
  assert.equal(deriveAdminEmailIndicator({ syncStatus: "connected", provider: "gmail" }).tooltip, "Gmail / Email");

  const indicator = read("shared/adminChannelConnectionStatus.ts");
  assert.doesNotMatch(indicator, /user\.email/);
  assert.match(indicator, /Never uses users\.email/);
});

run("J–K: both Admin surfaces show EM; WA/FB/IG unchanged; Shopify kept on Activation", () => {
  const admin = read("client/src/pages/Admin.tsx");
  assert.match(admin, /key: "WA"/);
  assert.match(admin, /key: "FB"/);
  assert.match(admin, /key: "IG"/);
  assert.match(admin, /key: "EM"/);
  assert.match(admin, /WA = WhatsApp · FB = Facebook Messenger · IG = Instagram · EM = Email \/ Gmail/);

  const tab = read("client/src/components/admin/AdminActivationTab.tsx");
  assert.match(tab, /key: "WA"/);
  assert.match(tab, /key: "FB"/);
  assert.match(tab, /key: "IG"/);
  assert.match(tab, /key: "EM"/);
  assert.match(tab, /key: "Shop"/);
  assert.match(tab, /row\.emailConnected/);
  assert.match(tab, /label: "Email \/ Gmail"/);

  const connections = deriveActivationChannelConnections({
    user: { id: "u1", shopifyShop: "store.myshopify.com", shopifyInstalledAt: new Date() },
    whatsappConnected: true,
    facebookConnected: false,
    instagramConnected: false,
    ghlUserIds: new Set(),
    emailConnected: true,
  });
  assert.equal(connections.whatsappConnected, true);
  assert.equal(connections.shopifyConnected, true);
  assert.equal(connections.emailConnected, true);
  assert.equal(isActivationChannelConnected("email", connections), true);
  assert.equal(isActivationChannelConnected("whatsapp", connections), true);
});

console.log("admin-conversation-usage-and-email.test.ts OK");
