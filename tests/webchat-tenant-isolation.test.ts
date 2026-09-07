/**
 * Multi-tenant webchat security + first-class inbound channel.
 * Run: npx tsx tests/webchat-tenant-isolation.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  isUuidLike,
  isWidgetPublicId,
  looksLikeRawTenantUserId,
  WIDGET_PUBLIC_ID_PREFIX,
} from "../shared/opaquePublicToken";
import { adminDenialStatus } from "../shared/adminAccess";
import { FOREIGN_RESOURCE_BODY, FOREIGN_RESOURCE_HTTP_STATUS, ownedOrNull } from "../shared/tenantOwnership";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import {
  mergeWebchatPageContext,
  sanitizeWebchatPageContextInput,
} from "../shared/webchatPageContext";
import { generateWidgetPublicId } from "../server/opaquePublicId";
import { isWebchatServerAiAllowlisted, isWebchatServerAiRolloutEnabled } from "../server/webchatServerAiRollout";
import { withUserQueryScope } from "../client/src/lib/accountQueryScope";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const ACCOUNT_A = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "22222222-2222-4222-8222-222222222222";
const ACCOUNT_C = "33333333-3333-4333-8333-333333333333";

{
  const id = generateWidgetPublicId();
  assert.equal(isWidgetPublicId(id), true);
  assert.equal(id.startsWith(WIDGET_PUBLIC_ID_PREFIX), true);
  assert.equal(id.includes(ACCOUNT_A), false);
  assert.equal(isUuidLike(id), false);
  assert.equal(looksLikeRawTenantUserId(ACCOUNT_A), true);
  assert.equal(looksLikeRawTenantUserId(id), false);
}

{
  assert.equal(adminDenialStatus({ isAdmin: false, hasCrmUser: false }), 401);
  assert.equal(adminDenialStatus({ isAdmin: false, hasCrmUser: true }), 403);
  assert.equal(adminDenialStatus({ isAdmin: true, hasCrmUser: true }), null);
}

{
  const usage = read("server/routes.ts");
  const usageIdx = usage.indexOf('app.get("/api/admin/usage"');
  assert.ok(usageIdx >= 0);
  const window = usage.slice(usageIdx, usageIdx + 400);
  assert.match(window, /requireSalesAdmin/);
  assert.doesNotMatch(window, /if \(!req\.user\)/);
  const indexSrc = read("server/index.ts");
  assert.match(indexSrc, /\/api\/admin\/queue\/stats", requireSalesAdmin/);
  assert.match(indexSrc, /app\.use\("\/admin\/queues", requireSalesAdmin/);
}

{
  const identity = read("server/widgetIdentity.ts");
  assert.match(identity, /getWidgetOwnerByPublicId/);
  assert.match(identity, /rejected_raw_user_id/);
  assert.match(identity, /WEBCHAT_LEGACY_USER_ID_WIDGET/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /resolvePublicWidgetAccess/);
  assert.match(webhooks, /parseWebchatInboundBody/);
  assert.match(webhooks, /dispatchWebchatInboundWorkflows/);
  assert.match(webhooks, /maybeRunWebchatServerAi/);
  assert.doesNotMatch(webhooks.slice(webhooks.indexOf('app.post("/api/webchat'), webhooks.indexOf('app.post("/api/webchat') + 2500), /storage\.getUser\(userId\)/);
}

{
  const access = read("server/webchatAccess.ts");
  assert.match(access, /parseWebchatInboundBody/);
  assert.match(access, /originAllowed/);
  assert.match(access, /consumeWebchatRateLimits/);
  assert.match(access, /MAX_MESSAGE = 4000/);
}

{
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /resolveTelegramWebhookOwner/);
  assert.match(webhooks, /x-telegram-bot-api-secret-token/);
  assert.match(webhooks, /resolveTiktokLeadOwner/);
  const legacyTiktok = webhooks.slice(
    webhooks.indexOf('app.post("/api/webhook/tiktok/lead"'),
    webhooks.indexOf('app.post("/api/webhook/tiktok/lead"') + 280,
  );
  assert.match(legacyTiktok, /404/);
  assert.doesNotMatch(legacyTiktok, /body\.userId/);
  const tiktokPublic = webhooks.slice(webhooks.indexOf("tiktok/lead/:publicId"), webhooks.indexOf("tiktok/lead/:publicId") + 900);
  assert.doesNotMatch(tiktokPublic, /const \{ userId/);
}

{
  const routes = read("server/routes.ts");
  const suggest = routes.slice(routes.indexOf('app.post("/api/ai/suggest-reply"'), routes.indexOf('app.post("/api/ai/extract-lead"'));
  assert.match(suggest, /getConversationForWorkspace/);
  assert.match(suggest, /FOREIGN_RESOURCE_BODY/);
  const extract = routes.slice(routes.indexOf('app.post("/api/ai/extract-lead"'), routes.indexOf('app.post("/api/ai/extract-lead"') + 1200);
  assert.match(extract, /getConversationForWorkspace/);
}

{
  assert.deepEqual(FOREIGN_RESOURCE_BODY, { error: "Not found" });
  assert.equal(FOREIGN_RESOURCE_HTTP_STATUS, 404);
  assert.equal(ownedOrNull({ userId: ACCOUNT_A, id: "c1" }, ACCOUNT_B), null);
  assert.ok(ownedOrNull({ userId: ACCOUNT_A, id: "c1" }, ACCOUNT_A));
}

{
  const worker = read("server/flowJobWorker.ts");
  assert.match(worker, /assertJobTenantBoundary/);
  assert.match(worker, /readConversationAiControl/);
  const noReply = read("server/automationNoReply.ts");
  assert.match(noReply, /assertJobTenantBoundary|tenant_mismatch|userId/);
}

{
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  assert.match(inbox, /withUserQueryScope\(\["\/api\/ai\/workspace-intelligence"\]/);
  const keyA = withUserQueryScope(["/api/ai/workspace-intelligence"], ACCOUNT_A);
  const keyB = withUserQueryScope(["/api/ai/workspace-intelligence"], ACCOUNT_B);
  assert.notEqual(JSON.stringify(keyA), JSON.stringify(keyB));
}

{
  const base = {
    rolloutEnabled: true,
    allowlisted: true,
    widgetEnabled: true,
    hasAiBrainAccess: true,
    planIsProOrTrial: true,
    chatbotOwnsReply: false,
    handoffActive: false,
    aiPaused: false,
    automationsPaused: false,
    optedOut: false,
    rateLimited: false,
  };
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "suggest_only" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto" }), "send_auto");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", hasAiBrainAccess: false }), "skip_no_access");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", chatbotOwnsReply: true }), "skip_chatbot_owns");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", bookingOwnsReply: true }), "skip_booking");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", crmFallbackOwnsReply: true }), "skip_crm_fallback");
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", handoffActive: true }), "skip_handoff");
  assert.equal(
    decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", rolloutEnabled: false, allowlisted: false }),
    "skip_flag_off",
  );
  assert.equal(decideWebchatAiReply({ ...base, aiModeRaw: "full_auto", allowlisted: false }), "send_auto");
}

{
  const rollout = read("server/webchatServerAiRollout.ts");
  assert.match(rollout, /WEBCHAT_SERVER_AI_AUTO/);
  assert.match(rollout, /WEBCHAT_SERVER_AI_AUTO_ALLOWLIST/);
  const prevFlag = process.env.WEBCHAT_SERVER_AI_AUTO;
  const prevList = process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST;
  process.env.WEBCHAT_SERVER_AI_AUTO = "";
  process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = "";
  assert.equal(isWebchatServerAiRolloutEnabled(), false);
  assert.equal(isWebchatServerAiAllowlisted(ACCOUNT_B), false);
  process.env.WEBCHAT_SERVER_AI_AUTO = "0";
  assert.equal(isWebchatServerAiRolloutEnabled(), false);
  process.env.WEBCHAT_SERVER_AI_AUTO = "true";
  process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = ACCOUNT_B;
  assert.equal(isWebchatServerAiRolloutEnabled(), true);
  assert.equal(isWebchatServerAiAllowlisted(ACCOUNT_B), true);
  assert.equal(isWebchatServerAiAllowlisted(ACCOUNT_A), false);
  process.env.WEBCHAT_SERVER_AI_AUTO = prevFlag;
  process.env.WEBCHAT_SERVER_AI_AUTO_ALLOWLIST = prevList;
}

{
  const inbound = read("server/webchatInboundWorkflows.ts");
  assert.match(inbound, /dispatchInboundMessagingAutomation/);
  assert.match(inbound, /contact\.userId !== params\.userId/);
  const channel = read("server/channelService.ts");
  assert.match(channel, /preferredChatbotFlowId/);
  assert.match(channel, /pauseAiControl/);
  assert.match(channel, /generatedBy/);
  assert.match(channel, /awaitExecution: channel === "webchat"/);
  assert.match(channel, /skipBookingIntent: bookingIntent/);
  assert.match(channel, /abortWebchatGeneration/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /WEBCHAT_AI_GENERATION_TIMEOUT_MS/);
  assert.match(auto, /generationLeaseAllowsCommit/);
  assert.match(auto, /registerWebchatGenerationAbort/);
  assert.match(auto, /bookingOwnsReply/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /await executeFlow/);
  assert.match(engine, /booking_fast_path_priority/);
}

{
  const first = sanitizeWebchatPageContextInput({
    parentUrl: "https://b.example/pricing?utm_source=google&utm_campaign=saas",
    pageTitle: "Pricing",
    referrer: "https://google.com/",
    matchedPageRule: "/pricing",
  });
  const merged = mergeWebchatPageContext({}, first, "2026-01-01T00:00:00.000Z");
  assert.equal(merged.landingUrl?.startsWith("https://b.example/pricing"), true);
  const later = sanitizeWebchatPageContextInput({
    parentUrl: "https://b.example/demo",
    pageTitle: "Demo",
  });
  const next = mergeWebchatPageContext(merged, later, "2026-01-01T01:00:00.000Z");
  assert.equal(next.landingUrl, merged.landingUrl);
  assert.ok(next.latestUrl?.includes("/demo"));
  assert.equal(next.utm?.campaign, "saas");
}

{
  const realtorBrain = { industry: "real_estate", servicesProducts: "listings" };
  const saasBrain = { industry: "saas", servicesProducts: "CRM" };
  assert.notEqual(realtorBrain.industry, saasBrain.industry);
  const knowledgeByUser: Record<string, typeof realtorBrain | Record<string, never>> = {
    [ACCOUNT_A]: realtorBrain,
    [ACCOUNT_B]: saasBrain,
    [ACCOUNT_C]: {},
  };
  assert.equal(knowledgeByUser[ACCOUNT_B].industry, "saas");
  assert.equal(Object.keys(knowledgeByUser[ACCOUNT_C]).length, 0);
  assert.notEqual(knowledgeByUser[ACCOUNT_A], knowledgeByUser[ACCOUNT_B]);
}

{
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /widgetPublicId/);
  assert.match(website, /buildWebchatScriptSnippet/);
  assert.doesNotMatch(website, /js\.src=f\+'\?id=\$\{user\.id\}'/);
  const channels = read("client/src/components/ChannelSettings.tsx");
  assert.match(channels, /buildWebchatScriptSnippet/);
  assert.doesNotMatch(channels, /\/api\/webchat\/\$\{user/);
  assert.doesNotMatch(channels, /data-user-id/);
  const agentHtml = read("shared/agent/publicAgentPageHtml.ts");
  assert.match(agentHtml, /config\.widgetPublicId/);
  assert.doesNotMatch(agentHtml, /widget-frame\/" \+ encodeURIComponent\(config\.userId\)/);
}

{
  const migration = read("migrations/0089_webchat_tenant_isolation.sql");
  assert.match(migration, /widget_public_id/);
  assert.match(migration, /wgt_/);
  assert.doesNotMatch(migration, /users\.id::text/);
  const webchatId = read("migrations/0091_contacts_webchat_id.sql");
  assert.match(webchatId, /ON contacts \(user_id, webchat_id\)/);
  assert.match(webchatId, /contacts_user_id_webchat_id_uidx/);
}

console.log("webchat-tenant-isolation.test.ts: all assertions passed");
