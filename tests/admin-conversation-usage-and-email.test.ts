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
import {
  nextConversationUsageAfterPeriodCheck,
  trialExpiryConversationUsageReset,
} from "../shared/conversationUsagePeriod";
import { startOfUtcMonth } from "../shared/usagePeriod";
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

run("Users table X / limit = plan conversation usage for the current period", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /conversationsUsed[\s\S]{0,80}limits\?\.conversationsUsed/);
  assert.match(routes, /conversationsLimit[\s\S]{0,80}limits\?\.conversationsLimit/);

  const admin = read("client/src/pages/Admin.tsx");
  assert.match(admin, /Conversation usage/);
  assert.match(admin, /Plan conversation usage for the current billing period/);
  assert.match(admin, /\$\{used\} \/ \$\{limit\}/);
});

run("B: increment only after a successful new conversation create", () => {
  const templates = read("server/routes/templates.ts");
  const ensure = sliceBetween(
    templates,
    "async function ensureWhatsAppConversationForContact",
    "export function registerTemplateRoutes",
  );
  const createAt = ensure.indexOf("storage.createConversation");
  const incrementAt = ensure.indexOf("subscriptionService.incrementConversationUsage");
  assert.ok(createAt >= 0 && incrementAt > createAt, "templates: create then increment");

  const channel = read("server/channelService.ts");
  const inbound = sliceBetween(channel, "let isNewConversation = false;", "Existing conversation found");
  assert.match(inbound, /createConversation/);
  assert.match(inbound, /incrementConversationUsage/);
  const outbound = sliceBetween(channel, "let conversation = await storage.getConversationByContactAndChannel", "enforceWhatsAppCustomerServiceWindow");
  const outCreate = outbound.indexOf("createConversation");
  const outInc = outbound.indexOf("incrementConversationUsage");
  assert.ok(outCreate >= 0 && outInc > outCreate, "outbound: create then increment");

  const campaign = read("server/campaignExecution.ts");
  const camp = sliceBetween(campaign, "async function ensureConversationForCampaign", "async function sendCampaignWhatsApp");
  assert.ok(
    camp.indexOf("createConversation") < camp.indexOf("incrementConversationUsage"),
    "campaign: create then increment",
  );

  const chatsRoute = read("server/routes.ts");
  const createChatRoute = sliceBetween(chatsRoute, "// Create a new chat", "// Update a chat");
  assert.ok(
    createChatRoute.indexOf("storage.createChat") < createChatRoute.indexOf("incrementConversationUsage"),
    "legacy /api/chats: create then increment",
  );
  assert.doesNotMatch(createChatRoute, /checkAndDecrementConversation/);
});

run("C: duplicate inbound webhook returns before usage increment", () => {
  const channel = read("server/channelService.ts");
  const dedupe = sliceBetween(channel, "Deduplicate: skip if this external message ID", "Inbox Worker");
  assert.match(dedupe, /getMessageByUserExternalId/);
  assert.match(dedupe, /deduped: true/);
  assert.doesNotMatch(dedupe, /incrementConversationUsage/);
});

run("D: Gmail poll + Pub/Sub share persist; persist never increments usage; duplicate providerMessageId skips", () => {
  const persist = read("server/emailChannel/persistInbound.ts");
  assert.doesNotMatch(persist, /incrementConversationUsage/);
  const skip = sliceBetween(persist, "getMessageByUserExternalId", "isCalendarOrInviteEmail");
  assert.match(skip, /created: false/);

  const send = read("server/emailChannel/sendService.ts");
  assert.doesNotMatch(send, /incrementConversationUsage/);

  const sync = read("server/emailChannel/syncService.ts");
  const persistCalls = (sync.match(/persistNormalizedEmailMessage/g) || []).length;
  assert.ok(persistCalls >= 3, "poll and push both persist through the same helper");
});

run("E: a second genuinely new conversation still has an increment path", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /if \(!conversation\) \{[\s\S]*?incrementConversationUsage/);
});

run("F: usage resets according to canonical period helper", () => {
  const now = new Date("2026-08-18T12:00:00.000Z");
  const rolled = nextConversationUsageAfterPeriodCheck({
    storedPeriodStart: new Date("2026-07-01T00:00:00.000Z"),
    canonicalPeriodStart: startOfUtcMonth(now),
    conversationsUsed: 2,
    conversationsLimit: 2000,
  });
  assert.equal(rolled.resetCounter, true);
  assert.equal(rolled.conversationsUsed, 0);

  const samePeriod = nextConversationUsageAfterPeriodCheck({
    storedPeriodStart: startOfUtcMonth(now),
    canonicalPeriodStart: startOfUtcMonth(now),
    conversationsUsed: 2,
    conversationsLimit: 2000,
  });
  assert.equal(samePeriod.resetCounter, false);
  assert.equal(samePeriod.conversationsUsed, 2);

  const expiry = trialExpiryConversationUsageReset(now);
  assert.equal(expiry.monthlyConversations, 0);

  const sub = read("server/subscriptionService.ts");
  assert.match(sub, /nextConversationUsageAfterPeriodCheck/);
  assert.match(sub, /storage\.incrementMonthlyConversations/);
  assert.doesNotMatch(
    sub,
    /monthlyConversations:\s*\(user\.monthlyConversations\s*\|\|\s*0\)\s*\+\s*1/,
  );

  const incrementFn = sliceBetween(sub, "async incrementConversationUsage", "export const subscriptionService");
  assert.match(incrementFn, /storage\.incrementMonthlyConversations/);
  assert.doesNotMatch(incrementFn, /updateUser/);

  const storage = read("server/storage.ts");
  assert.match(storage, /monthlyConversations: sql`coalesce\(\$\{users\.monthlyConversations\}, 0\) \+ 1`/);
  assert.match(storage, /lifetimeConversations: sql`coalesce\(\$\{users\.lifetimeConversations\}, 0\) \+ 1`/);
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
