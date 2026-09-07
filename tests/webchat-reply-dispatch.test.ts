/**
 * Web Chat reply dispatch: no implicit identity prompt; configured responders only.
 * Run: npx tsx --test tests/webchat-reply-dispatch.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideWebchatAiReply } from "../shared/webchatAiPolicy";
import { decideWebchatTurnOwner } from "../shared/webchatTurnOwner";
import {
  resolveWebchatConfiguredAwayReply,
  WEBCHAT_HARDCODED_IDENTITY_PROMPT,
  webchatAllowsCrmGreetingOrIdentityFallback,
} from "../shared/webchatReplyPolicy";
import { resolveWebchatContactFromRows } from "../shared/webchatContactLookup";
import { WEBSITE_VISITOR_NAME } from "../shared/agent/webchatLeadContext";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const aiBase = {
  rolloutEnabled: true,
  allowlisted: true,
  widgetEnabled: true,
  hasAiBrainAccess: true,
  planIsProOrTrial: true,
  aiModeRaw: "full_auto" as string | null,
  chatbotOwnsReply: false,
  bookingOwnsReply: false,
  crmFallbackOwnsReply: false,
  handoffActive: false,
  aiPaused: false,
  automationsPaused: false,
  optedOut: false,
  rateLimited: false,
};

test("plain Hello with no configured responder sends zero outbound replies", () => {
  assert.equal(webchatAllowsCrmGreetingOrIdentityFallback(), false);
  const helloAway = resolveWebchatConfiguredAwayReply({
    businessHoursEnabled: false,
    awayMessageEnabled: false,
    autoReplyEnabled: true,
  } as { businessHoursEnabled: boolean; awayMessageEnabled: boolean });
  assert.equal(helloAway.send, false);
  const turn = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: false, visitorFacing: false, reason: "no_flow_match" },
  });
  assert.equal(turn.chatbotOwnsReply, false);
  assert.equal(turn.owner, "ai_eligible");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  const channel = read("server/channelService.ts");
  const schedule = channel.slice(
    channel.indexOf("private async _scheduleAutoReply"),
    channel.indexOf("private getChannelIdField"),
  );
  assert.match(schedule, /Website Chat never sends an implicit identity prompt/);
  assert.doesNotMatch(schedule, /contactNeedsWebchatIdentity/);
  assert.equal(channel.includes(WEBCHAT_HARDCODED_IDENTITY_PROMPT), false);
});

test("no personal-information request is generated implicitly", () => {
  const channel = read("server/channelService.ts");
  const auto = read("server/webchatAiAutoReply.ts");
  const lead = read("server/webchatLeadService.ts");
  const webhooks = read("server/routes/webhooks.ts");
  for (const src of [channel, auto, lead, webhooks]) {
    assert.doesNotMatch(src, /best phone number or email to reach you/);
    assert.doesNotMatch(src, /WEBCHAT_IDENTITY_PROMPT/);
  }
  assert.equal(webchatAllowsCrmGreetingOrIdentityFallback(), false);
});

test("a matching keyword flow responds exactly once and suppresses Auto AI", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /evaluateChatbotInboundArbitration/);
  assert.match(channel, /triggerChatbotFlows/);
  assert.match(channel, /if \(!chatbotWillFire\)/);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /markFired\(ctx\.conversationId\)/);
  assert.match(engine, /isCoolingDown/);
  assert.match(engine, /await executeFlow\(chosen\.flow, ctx\)/);
  const webhooks = read("server/routes/webhooks.ts");
  const post = webhooks.slice(webhooks.indexOf('app.post("/api/webchat/:userId"'));
  const window = post.slice(0, post.indexOf('app.get("/api/webchat/:userId/settings"'));
  assert.match(window, /!result\.chatbotWillFire/);
  assert.match(window, /maybeRunWebchatServerAi/);
  assert.equal(
    decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }),
    "skip_chatbot_owns",
  );
  const scripted = decideWebchatTurnOwner({
    bookingIntent: false,
    chatbot: { triggered: true, visitorFacing: true, reason: "scripted_reply" },
  });
  assert.equal(scripted.chatbotOwnsReply, true);
});

test("Auto AI responds only when entitlement, configuration, and Auto mode all pass", () => {
  assert.equal(decideWebchatAiReply(aiBase), "send_auto");
  assert.equal(decideWebchatAiReply({ ...aiBase, hasAiBrainAccess: false }), "skip_no_access");
  assert.equal(decideWebchatAiReply({ ...aiBase, planIsProOrTrial: false, hasAiBrainAccess: false }), "skip_no_access");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "off" }), "skip_manual");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest_only" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, aiModeRaw: "suggest" }), "suggest_only");
  assert.equal(decideWebchatAiReply({ ...aiBase, chatbotOwnsReply: true }), "skip_chatbot_owns");
  assert.equal(decideWebchatAiReply({ ...aiBase, bookingOwnsReply: true }), "skip_booking");
  assert.equal(decideWebchatAiReply({ ...aiBase, crmFallbackOwnsReply: true }), "skip_crm_fallback");
  assert.equal(decideWebchatAiReply({ ...aiBase, widgetEnabled: false }), "skip_widget_disabled");
  assert.equal(decideWebchatAiReply({ ...aiBase, rolloutEnabled: false }), "skip_flag_off");
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /crmFallbackOwnsReply/);
  assert.match(auto, /generatedBy: "ai_brain"/);
  assert.match(auto, /inboundMessageId ===\s*params\.inboundMessageId/);
});

test("polling, refresh, and settings never trigger replies or contacts", () => {
  const webhooks = read("server/routes/webhooks.ts");
  const settings = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/settings"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
  );
  assert.doesNotMatch(settings, /processIncomingMessage/);
  assert.doesNotMatch(settings, /createContact/);
  assert.doesNotMatch(settings, /maybeRunWebchatServerAi/);
  const poll = webhooks.slice(
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/messages"'),
    webhooks.indexOf('app.get("/api/webchat/:userId/:visitorId/media/'),
  );
  assert.doesNotMatch(poll, /processIncomingMessage/);
  assert.doesNotMatch(poll, /maybeRunWebchatServerAi/);
  assert.doesNotMatch(poll, /_scheduleAutoReply/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /Welcome bubble/);
  assert.match(frame, /deduped\.length === 0/);
  assert.doesNotMatch(frame, /processIncomingMessage/);
});

test("repeated delivery of the same inbound event is idempotent", () => {
  const channel = read("server/channelService.ts");
  assert.match(channel, /getMessageByUserExternalId/);
  assert.match(channel, /deduped: true/);
  assert.match(channel, /logInboundDuplicateIgnored/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /!result\.deduped/);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /:idempotent/);
  assert.match(auto, /webchat_ai:\$\{params\.userId\}:\$\{params\.inboundMessageId\}/);
});

test("visitor continuity is independent of reply generation", () => {
  const visitor = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const rows = [
    {
      id: "c1",
      userId: "t1",
      name: WEBSITE_VISITOR_NAME,
      phone: "5550100100",
      webchatId: visitor,
      source: "webchat",
      customFields: { webchatVisitorId: visitor, webchatIdentity: { status: "identified" } },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  assert.equal(resolveWebchatContactFromRows(rows, "t1", visitor)?.id, "c1");
  assert.equal(resolveWebchatContactFromRows(rows, "t2", visitor), undefined);
  const channel = read("server/channelService.ts");
  assert.match(channel, /getContactByChannelId\(userId, channel, channelContactId\)/);
  assert.match(channel, /case 'webchat': return 'webchatId'/);
});

test("structured form and media paths still use the shared inbound processor", () => {
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /contentType: "form_result"/);
  assert.match(webhooks, /contentType: "image"/);
  assert.match(webhooks, /processIncomingMessage/);
  const form = read("tests/webchat-structured-form.test.ts");
  assert.match(form, /applyWebchatFormToContact/);
  assert.match(webhooks, /sendWebchatPublicJson\(res, 200, \{ success: true \}\)/);
});

test("tenant-configured away message is the only Web Chat CRM fallback", () => {
  const weekend = new Date(Date.UTC(2026, 8, 5, 15, 0, 0));
  const away = resolveWebchatConfiguredAwayReply(
    {
      businessHoursEnabled: true,
      awayMessageEnabled: true,
      awayMessage: "We are closed.",
      timezone: "UTC",
      businessDays: [1, 2, 3, 4, 5],
      businessHoursStart: "09:00",
      businessHoursEnd: "17:00",
    },
    weekend,
  );
  assert.equal(away.send, true);
  if (away.send) assert.equal(away.text, "We are closed.");
  const disabled = resolveWebchatConfiguredAwayReply({
    businessHoursEnabled: true,
    awayMessageEnabled: false,
    awayMessage: "We are closed.",
  });
  assert.equal(disabled.send, false);
  const auto = read("server/webchatAiAutoReply.ts");
  assert.match(auto, /crmFallbackOwnsReply/);
});
