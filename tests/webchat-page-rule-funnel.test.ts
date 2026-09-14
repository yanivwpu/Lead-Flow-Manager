/**
 * Website Chat page-aware funnel: matching, SPA protocol, engagement lifecycle,
 * localized actions, chatbot collision gates, and the Pricing fixture.
 * Run: npx tsx --test tests/webchat-page-rule-funnel.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyChatbotVisitorIntent,
  isCanonicalBookingTurn,
  resolveChatbotCompletionRouting,
} from "@shared/chatbotCompletionContext";
import {
  matchWidgetPageRule,
  pageRuleMatchesHref,
  pageRuleStableKey,
  validatePageRuleInboundAction,
} from "@shared/webchatPageRuleMatch";
import {
  buildWebchatPageContextMessage,
  effectivePageContextKey,
  parseTrustedParentPageContextMessage,
  WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE,
  WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE,
} from "@shared/webchatPageContextMessage";
import {
  decidePageRuleEngagement,
  readShownPageRuleKeys,
  shouldApplyPageRulePrefill,
  shownPageRulesStorageKey,
  transcriptHasPendingVisitorInput,
  writeShownPageRuleKeys,
} from "@shared/webchatPageRuleEngagement";
import { pageRuleChatbotTriggerGates } from "@shared/webchatPageRuleChatbotGates";
import {
  decidePageRuleTeaser,
  resolveLocalizedPageRuleTeaser,
} from "@shared/webchatPageRuleTeaser";
import { PRICING_PAGE_RULE_ACTION, PRICING_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_TEASER } from "@shared/webchatPageRuleFixtures";
import { validateWidgetPageRules } from "@shared/webchatWidgetSettings";
import { visitorSafeWidgetPageRules } from "@shared/webchatWidgetLauncher";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";
import { parseWebchatInboundBody } from "../server/webchatAccess";
import { createWebchatVisitorId } from "@shared/webchatVisitorId";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

const PRICING_SETTINGS = {
  pageRules: [PRICING_PAGE_RULE_FIXTURE],
};

test("pathname matching does not treat /pricing-guide or query text as /pricing", () => {
  const rule = { urlContains: "/pricing", matchType: "pathname" };
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/pricing"), true);
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/pricing?plan=pro#faq"), true);
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/pricing/"), true);
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/pricing-guide"), false);
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/?next=/pricing"), false);
  assert.equal(pageRuleMatchesHref(rule, "https://www.example.com/es/pricing"), false);
  assert.equal(pageRuleMatchesHref({ urlContains: "/es/pricing", matchType: "pathname" }, "https://www.example.com/es/pricing"), true);
});

test("legacy contains rules stay compatible and first match wins", () => {
  const legacy = { urlContains: "/pricing" };
  assert.equal(pageRuleMatchesHref(legacy, "https://www.example.com/pricing-guide"), true);
  assert.equal(pageRuleMatchesHref(legacy, "https://www.example.com/?next=/pricing"), true);
  const settings = {
    pageRules: [
      { urlContains: "/pricing", matchType: "pathname", greeting: "Exact" },
      { urlContains: "/pricing", greeting: "Legacy" },
    ],
  };
  const dup = validateWidgetPageRules(settings.pageRules);
  assert.equal(dup.ok, false);
  const ordered = {
    pageRules: [
      { urlContains: "/blog", matchType: "pathname", greeting: "Blog" },
      { urlContains: "/pricing", matchType: "pathname", greeting: "Price" },
    ],
  };
  const hit = matchWidgetPageRule(ordered, "https://tenant.example/pricing");
  assert.equal(hit?.greeting, "Price");
  assert.equal(hit?.ruleKey, pageRuleStableKey({ urlContains: "/pricing", matchType: "pathname" }));
  assert.equal(hit?.ruleKey.includes("://"), false);
});

test("localized EN/ES/HE actions map by stable index and validate the current label", () => {
  const matchedEn = matchWidgetPageRule(PRICING_SETTINGS, "https://tenant.example/pricing", "en");
  assert.ok(matchedEn);
  assert.match(matchedEn.greeting || "", /Comparing plans/);
  assert.deepEqual(matchedEn.suggestedQuestions, [...PRICING_PAGE_RULE_FIXTURE.suggestedQuestions]);
  const es = matchWidgetPageRule(PRICING_SETTINGS, "https://tenant.example/pricing", "es");
  assert.equal(es?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.compare], "Comparar Free y Pro");
  const he = matchWidgetPageRule(PRICING_SETTINGS, "https://tenant.example/pricing", "he");
  assert.equal(he?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo], "קביעת הדגמה");
  const validatedEs = validatePageRuleInboundAction({
    matched: es!,
    message: "Calcular mi ahorro",
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
  });
  assert.equal(validatedEs?.actionIndex, PRICING_PAGE_RULE_ACTION.savings);
  assert.equal(
    validatePageRuleInboundAction({
      matched: es!,
      message: "Book a demo",
      actionIndex: PRICING_PAGE_RULE_ACTION.compare,
    }),
    null,
  );
  assert.equal(
    validatePageRuleInboundAction({
      matched: es!,
      message: "Book a demo",
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    })?.label,
    "Book a demo",
  );
  assert.equal(
    validatePageRuleInboundAction({
      matched: matchedEn!,
      message: "Calculate my savings",
    }),
    null,
  );
});

test("empty landing vs existing conversation card, dismiss, and one-shot", () => {
  const key = pageRuleStableKey(PRICING_PAGE_RULE_FIXTURE);
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: false,
      transcriptCount: 0,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "empty",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: false,
      transcriptCount: 2,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "card",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: true,
      activeThisMount: true,
      transcriptCount: 2,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "card",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: true,
      activeThisMount: false,
      transcriptCount: 2,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: false,
      dismissed: true,
      transcriptCount: 2,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: false,
      transcriptCount: 2,
      humanTakeover: true,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(
    decidePageRuleEngagement({
      hasMatch: true,
      ruleKey: key,
      alreadyShown: false,
      transcriptCount: 2,
      humanTakeover: false,
      pendingVisitorInput: true,
    }),
    "none",
  );
  const stored = writeShownPageRuleKeys([], key);
  assert.deepEqual(readShownPageRuleKeys(JSON.stringify(stored)), [key]);
  assert.equal(shownPageRulesStorageKey("wgt_abc", "vid_1").includes("://"), false);
});

test("pending Ask Question / buttons own the turn and suppress the card", () => {
  assert.equal(
    transcriptHasPendingVisitorInput([
      { direction: "outbound", contentType: "buttons", templateVariables: { chatbotButtons: [{ label: "A", value: "A" }] } },
    ]),
    true,
  );
  assert.equal(
    transcriptHasPendingVisitorInput([
      { direction: "outbound", contentType: "buttons", templateVariables: { chatbotButtons: [{ label: "A", value: "A" }] } },
      { direction: "inbound", contentType: "text" },
    ]),
    false,
  );
  assert.equal(
    shouldApplyPageRulePrefill({
      transcriptCount: 2,
      composerDirty: false,
      alreadyApplied: false,
      prefill: "Hi about pricing",
    }),
    false,
  );
  assert.equal(
    shouldApplyPageRulePrefill({
      transcriptCount: 0,
      composerDirty: true,
      alreadyApplied: false,
      prefill: "Hi about pricing",
    }),
    false,
  );
});

test("untrusted page-context postMessage is rejected; same page is not a duplicate update", () => {
  const trusted = buildWebchatPageContextMessage({
    widgetId: "wgt_abc",
    href: "https://www.example.com/pricing",
    pageTitle: "Pricing",
  });
  assert.ok(trusted);
  assert.equal(trusted.source, WEBCHAT_PAGE_CONTEXT_MESSAGE_SOURCE);
  assert.equal(trusted.type, WEBCHAT_PAGE_CONTEXT_MESSAGE_TYPE);
  const parent = {};
  assert.ok(
    parseTrustedParentPageContextMessage(
      { origin: "https://www.example.com", source: parent, data: trusted },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.example.com", expectedSource: parent },
    ),
  );
  assert.equal(
    parseTrustedParentPageContextMessage(
      { origin: "https://evil.example", source: parent, data: trusted },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.example.com", expectedSource: parent },
    ),
    null,
  );
  assert.equal(
    parseTrustedParentPageContextMessage(
      { origin: "https://www.example.com", source: {}, data: trusted },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.example.com", expectedSource: parent },
    ),
    null,
  );
  assert.equal(
    parseTrustedParentPageContextMessage(
      {
        origin: "https://www.example.com",
        source: parent,
        data: { ...trusted, href: "https://evil.example/pricing" },
      },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.example.com", expectedSource: parent },
    ),
    null,
  );
  assert.equal(
    parseTrustedParentPageContextMessage(
      { origin: "https://www.example.com", source: parent, data: { ...trusted, source: "wcw", type: "wcw-branding-ready" } },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.example.com", expectedSource: parent },
    ),
    null,
  );
  assert.equal(
    effectivePageContextKey("https://www.example.com/pricing?x=1", "Pricing"),
    effectivePageContextKey("https://www.example.com/pricing", "Pricing"),
  );
});

test("SPA widget.js posts page context and does not reload the iframe", () => {
  const js = buildWebchatPublicScript({ origin: "https://app.example.com" });
  assert.doesNotThrow(() => new Function(js));
  assert.equal(/https\?:\/\/\//.test(js), false);
  assert.match(js, /hist\.pushState/);
  assert.match(js, /hist\.replaceState/);
  assert.match(js, /popstate/);
  assert.match(js, /hashchange/);
  assert.match(js, /wcw-page-context/);
  assert.match(js, /wcw-parent/);
  assert.match(js, /function postPageContext/);
  assert.match(js, /pathname_prefix/);
  assert.match(js, /wcw-pr-teaser/);
  assert.match(js, /wcw-teaser-gate/);
  assert.match(js, /teaserGreeting/);
  assert.doesNotMatch(js, /Comparing plans\? I can help you choose Free or Pro/);
  const sync = js.slice(js.indexOf("function syncFrameSrc()"), js.indexOf("function loadIframe()"));
  assert.doesNotMatch(sync, /fr\.src\s*=/);
  assert.match(sync, /postPageContext/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /parseTrustedParentPageContextMessage/);
  assert.match(frame, /setParentPageHref/);
  assert.match(frame, /webchat-page-rule-card/);
  assert.match(frame, /webchatTeaserGateMessage/);
  assert.doesNotMatch(frame, /PRICING_PAGE_RULE_FIXTURE/);
  assert.doesNotMatch(js, /whachatcrm\.com/);
});

test("page-rule action skips generic Ask Question and cannot steal an existing conversation", () => {
  const existing = pageRuleChatbotTriggerGates({
    isNewConversation: false,
    skipNewChatTrigger: true,
    preferredFlowId: "flow-pricing",
  });
  assert.equal(existing.preferredFlowId, undefined);
  assert.equal(existing.allowNewChatTrigger, false);
  const freshAction = pageRuleChatbotTriggerGates({
    isNewConversation: true,
    skipNewChatTrigger: true,
    preferredFlowId: "flow-pricing",
  });
  assert.equal(freshAction.preferredFlowId, "flow-pricing");
  assert.equal(freshAction.allowNewChatTrigger, false);
  const freshPlain = pageRuleChatbotTriggerGates({
    isNewConversation: true,
    skipNewChatTrigger: false,
    preferredFlowId: undefined,
  });
  assert.equal(freshPlain.allowNewChatTrigger, true);
  const engine = read("server/chatbotEngine.ts");
  assert.match(engine, /pageRuleChatbotTriggerGates/);
  assert.match(engine, /skipNewChatTrigger/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /resolveTrustedPageRuleInboundAction/);
  assert.match(webhooks, /skipNewChatTrigger: Boolean\(validatedAction\)/);
  assert.match(webhooks, /validatedPageRuleAction: validatedAction/);
  assert.doesNotMatch(webhooks, /visitor_intent/);
});

test("Pricing fixture routes compare/savings through pricing AI and Book a demo through booking", () => {
  const compare = PRICING_PAGE_RULE_FIXTURE.suggestedQuestions[PRICING_PAGE_RULE_ACTION.compare];
  const savings = PRICING_PAGE_RULE_FIXTURE.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings];
  const book = PRICING_PAGE_RULE_FIXTURE.suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo];
  assert.equal(classifyChatbotVisitorIntent(compare), "features_pricing");
  assert.equal(classifyChatbotVisitorIntent(savings), "calculate_savings");
  assert.equal(classifyChatbotVisitorIntent(book), "book_demo");
  assert.equal(isCanonicalBookingTurn({ inbound: book }), true);
  assert.equal(isCanonicalBookingTurn({ inbound: compare }), false);
  assert.equal(isCanonicalBookingTurn({ inbound: savings }), false);
  const compareRouting = resolveChatbotCompletionRouting({ inbound: compare });
  assert.equal(compareRouting.subIntents.includes("booking_question"), false);
  const bookRouting = resolveChatbotCompletionRouting({ inbound: book });
  assert.equal(bookRouting.subIntents.includes("booking_question"), true);
  const inbound = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: compare,
    parentUrl: "https://www.example.com/pricing",
    pageRuleAction: { actionIndex: 0, canonicalIntent: "book_demo" },
  });
  assert.equal(inbound.ok, true);
  if (inbound.ok) {
    assert.equal(inbound.data.pageRuleActionIndex, 0);
    assert.equal("canonicalIntent" in inbound.data, false);
  }
});

test("visitor-safe launcher includes matchType and never ships flow ids or the fixture as a default", () => {
  const rules = visitorSafeWidgetPageRules(
    { pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE, chatbotFlowId: "secret-flow" }] },
    "es",
  );
  assert.equal(rules[0]?.matchType, "pathname");
  assert.equal(rules[0]?.suggestedQuestions[0], "Comparar Free y Pro");
  assert.equal(rules[0]?.teaserGreeting, PRICING_PAGE_RULE_TEASER.es);
  assert.notEqual(rules[0]?.teaserGreeting, rules[0]?.greeting);
  assert.equal("chatbotFlowId" in rules[0], false);
  const defaults = read("shared/webchatWidgetSettings.ts");
  assert.match(defaults, /pageRules: \[\]/);
  assert.doesNotMatch(defaults, /Comparing plans\?/);
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /select-rule-match/);
  assert.match(website, /input-rule-questions-es/);
  assert.match(website, /input-rule-teaser/);
  assert.match(website, /teaserGreeting/);
});

test("page-rule teaser copy is short, localized, and suppressed for takeover or pending input", () => {
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "en", ...PRICING_PAGE_RULE_FIXTURE }), PRICING_PAGE_RULE_TEASER.en);
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "es", ...PRICING_PAGE_RULE_FIXTURE }), PRICING_PAGE_RULE_TEASER.es);
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "he", ...PRICING_PAGE_RULE_FIXTURE }), PRICING_PAGE_RULE_TEASER.he);
  const legacy = { urlContains: "/about", greeting: "Hello there from a long welcome that should not fill the bubble by itself if we only take the first sentence." };
  const fallback = resolveLocalizedPageRuleTeaser(legacy);
  assert.ok(fallback.length <= 140);
  assert.notEqual(fallback, PRICING_PAGE_RULE_FIXTURE.greeting);
  assert.equal(
    decidePageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: true,
      deviceAllowed: true,
      ruleKey: "pathname:/pricing",
      teaserText: PRICING_PAGE_RULE_TEASER.en,
      alreadyShownForRule: false,
      cooldownActive: false,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(
    decidePageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: false,
      deviceAllowed: true,
      ruleKey: "pathname:/pricing",
      teaserText: PRICING_PAGE_RULE_TEASER.en,
      alreadyShownForRule: false,
      cooldownActive: false,
      humanTakeover: false,
      pendingVisitorInput: true,
    }),
    "none",
  );
});

test("cross-tenant page-rule flow still requires workspace ownership", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /getChatbotFlowForWorkspace/);
  assert.match(routes, /teaserGreeting: z\.string\(\)\.max\(200\)\.optional\(\)/);
  const webhooks = read("server/routes/webhooks.ts");
  assert.match(webhooks, /getChatbotFlowForWorkspace\(userId, matched\.chatbotFlowId\)/);
});
