/**
 * Homepage Page Rule actions: semantic kinds, grounded features, booking qualification skip,
 * find-solution discovery, mobile payload parity, and polling display.
 * Run: npx tsx --test tests/webchat-homepage-page-rule-actions.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Contact, Conversation } from "@shared/schema";
import { createWebchatVisitorId } from "@shared/webchatVisitorId";
import {
  HOMEPAGE_PAGE_RULE_ACTION,
  HOMEPAGE_PAGE_RULE_FIXTURE,
  PRICING_PAGE_RULE_ACTION,
  PRICING_PAGE_RULE_FIXTURE,
} from "@shared/webchatPageRuleFixtures";
import {
  classifyPageRuleActionKind,
  classifyPageRuleActionKindFromRule,
  pageActionKindToVisitorIntent,
  resolveCurrentTurnPageAction,
  resolveTrustedPageRuleInboundAction,
  bindPageRuleActionToInbound,
  stampWebchatPageAction,
} from "@shared/webchatPageRuleAction";
import { matchWidgetPageRule, pageRuleStableKey } from "@shared/webchatPageRuleMatch";
import {
  chatbotCompletionPromptRules,
  resolveChatbotCompletionRouting,
} from "@shared/chatbotCompletionContext";
import {
  trustedPageRuleBookDemoReply,
  trustedPageRuleFindSolutionReply,
} from "@shared/webchatPageRuleReplies";
import { evaluateFullAutoSend, isSafeStructuredBookingCta } from "../server/aiAutoSendGate";
import { parseWebchatInboundBody } from "../server/webchatAccess";
import { webchatAutoSendIdempotencyKey } from "@shared/webchatAiPolicy";
import { dispatchWebchatInboundAi } from "../server/webchatInboundReplyDispatch";
import {
  buildTurnEvidenceBundle,
  evaluateBundleAmountGrounding,
  evidenceDiagnostics,
} from "@shared/turnEvidence";
import { startPricingSavingsJourney } from "@shared/webchatActiveJourney";
import { mergeWebchatPolledMessages } from "@shared/webchatWidgetScroll";
import { toPublicWebchatMessages } from "@shared/webchatPublicMessages";
import {
  assembleFeaturesPricingReply,
  isRoboticFeaturesPricingDraft,
} from "@shared/featuresPricingReply";
import { validateWidgetPageRules } from "@shared/webchatWidgetSettings";
import { isValidIdentityName } from "@shared/webchatIdentityFields";
import { isDraftAmountGrounded } from "@shared/factGrounding";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const CONTACT_CTA = "https://www.whachatcrm.com/contact";
const HOME = "https://www.whachatcrm.com/";
const HOME_ES = "https://www.whachatcrm.com/es";
const HOME_HE = "https://www.whachatcrm.com/he";
const SETTINGS = { pageRules: [HOMEPAGE_PAGE_RULE_FIXTURE] };
const KEY = pageRuleStableKey({ urlContains: "/", matchType: "pathname" });
const FIVE_GAPS = {
  qualifyingQuestions: [
    { key: "business_profile", label: "Business profile", question: "What type of business do you run?", required: true, enabled: true },
    { key: "budget", label: "Budget", question: "What is your budget?", required: true, enabled: true },
    { key: "timeline", label: "Timeline", question: "When do you want to start?", required: true, enabled: true },
    { key: "package", label: "Package", question: "Which package are you considering?", required: true, enabled: true },
    { key: "channels", label: "Channels", question: "Which channels do you need?", required: true, enabled: true },
  ],
};

const FEATURE_DRAFT =
  "Free covers Website Chat. Pro is $49/month or $490/year and includes AI Brain, Unified Inbox, workflows, and Prospect AI. WhachatCRM adds 0% markup; Meta conversation fees still apply. Which channel matters most for you?";

function localeLabels(locale: "en" | "es" | "he") {
  return [...HOMEPAGE_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions];
}

function widgetInbound(input: {
  message: string;
  actionIndex?: number;
  canonicalIntent?: string;
  parentUrl?: string;
  locale?: string;
  originAuthorized?: boolean;
  inboundMessageId?: string;
  staleInboundMessageId?: string;
  settings?: Record<string, unknown>;
}) {
  const parsed = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: input.message,
    parentUrl: input.parentUrl ?? HOME,
    locale: input.locale,
    pageRuleAction:
      typeof input.actionIndex === "number" || input.canonicalIntent
        ? { actionIndex: input.actionIndex, canonicalIntent: input.canonicalIntent }
        : undefined,
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected parse ok");
  const inboundId = input.inboundMessageId || "in-current";
  const validated = resolveTrustedPageRuleInboundAction({
    originAuthorized: input.originAuthorized !== false,
    settings: input.settings ?? SETTINGS,
    parentUrl: parsed.data.parentUrl,
    locale: parsed.data.locale || input.locale,
    message: parsed.data.message,
    actionIndex: parsed.data.pageRuleActionIndex,
  });
  const stamp = validated ? bindPageRuleActionToInbound(validated, inboundId) : null;
  const pageContext = stampWebchatPageAction({}, stamp);
  const current = resolveCurrentTurnPageAction({
    pageContext,
    inboundMessageId: input.staleInboundMessageId || inboundId,
  });
  return { parsed: parsed.data, validated, stamp, pageContext, current };
}

function gateFor(
  lastInbound: string,
  pageAction: ReturnType<typeof resolveCurrentTurnPageAction>,
  extras?: {
    suggestion?: string;
    grounded?: boolean;
    groundingViolations?: string[];
    verifiedBookingUrl?: string | null;
    businessKnowledge?: typeof FIVE_GAPS;
  },
) {
  return evaluateFullAutoSend({
    businessMode: "auto",
    channel: "webchat",
    conversationHistory: [{ role: "user", content: lastInbound }],
    suggestion: extras?.suggestion ?? FEATURE_DRAFT,
    confidence: 0.9,
    confidenceProvided: true,
    knowledgeGrounded: extras?.grounded !== false,
    groundingViolations: extras?.groundingViolations,
    currentTurnPageAction: pageAction,
    businessKnowledge: extras?.businessKnowledge ?? FIVE_GAPS,
    verifiedBookingUrl: extras?.verifiedBookingUrl ?? DEMO_URL,
  });
}

function publishedPricingBundle() {
  return buildTurnEvidenceBundle({
    userId: "tenant-a",
    websiteKnowledgeText:
      "Free includes Website Chat. Pro is $49/month or $490/year and includes AI Brain, Unified Inbox, workflows, Prospect AI, and 0% WhachatCRM markup.",
  });
}

test("Homepage EN/ES/HE Features & pricing clicks share one rule key and features_pricing kind", () => {
  assert.equal(classifyPageRuleActionKind("Features & pricing"), "features_pricing");
  assert.equal(classifyPageRuleActionKind("Compare Free & Pro"), "compare_plans");
  for (const [href, locale] of [
    [HOME, "en"],
    [HOME_ES, "es"],
    [HOME_HE, "he"],
  ] as const) {
    const labels = localeLabels(locale);
    const hit = widgetInbound({
      message: labels[HOMEPAGE_PAGE_RULE_ACTION.features],
      actionIndex: HOMEPAGE_PAGE_RULE_ACTION.features,
      parentUrl: href,
      locale,
    });
    assert.equal(hit.current.trusted, true);
    assert.equal(hit.current.provenanceCurrentInbound, true);
    assert.equal(hit.current.kind, "features_pricing");
    assert.equal(hit.current.ruleKey, KEY);
    assert.equal(pageActionKindToVisitorIntent(hit.current.kind), "features_pricing");
    const routing = resolveChatbotCompletionRouting({
      inbound: labels[HOMEPAGE_PAGE_RULE_ACTION.features],
      pageActionKind: hit.current.kind,
    });
    assert.ok(routing.subIntents.includes("pricing_question"));
    assert.ok(routing.subIntents.includes("benefits_question"));
    assert.equal(routing.subIntents.includes("booking_question"), false);
    const sent = gateFor(hit.parsed.message, hit.current, { suggestion: FEATURE_DRAFT });
    assert.equal(sent.allowed, true);
    assert.equal(sent.reason, "ok_validated_page_action");
    assert.equal(sent.pageActionValidated, true);
  }
});

test("selected evidence grounds numeric claims; invented pricing stays unsupported_amount", () => {
  const bundle = publishedPricingBundle();
  const diag = evidenceDiagnostics(bundle);
  assert.match(diag.selectedEvidenceCategories, /tenant_chunk:1/);
  assert.match(diag.selectedEvidenceCategories, /amount_sources:website_chunk/);
  assert.equal(evaluateBundleAmountGrounding({ draft: FEATURE_DRAFT, bundle }).ok, true);
  const invented = evaluateBundleAmountGrounding({ draft: "Pro is $999/month.", bundle });
  assert.equal(invented.ok, false);
  assert.ok(invented.unsupportedAmounts.includes("999"));
  const he = widgetInbound({
    message: localeLabels("he")[0],
    actionIndex: 0,
    parentUrl: HOME_HE,
    locale: "he",
  });
  const held = gateFor(he.parsed.message, he.current, {
    suggestion: "Pro is $999/month.",
    groundingViolations: ["unsupported_amount"],
  });
  assert.equal(held.allowed, false);
  assert.equal(held.reason, "grounding_violation:unsupported_amount");
});

test("Homepage EN/ES/HE Book a demo sends one verified Calendly reply despite five missing Copilot fields", () => {
  for (const [href, locale] of [
    [HOME, "en"],
    [HOME_ES, "es"],
    [HOME_HE, "he"],
  ] as const) {
    const labels = localeLabels(locale);
    const book = widgetInbound({
      message: labels[HOMEPAGE_PAGE_RULE_ACTION.bookDemo],
      actionIndex: HOMEPAGE_PAGE_RULE_ACTION.bookDemo,
      parentUrl: href,
      locale,
    });
    assert.equal(book.current.kind, "book_demo");
    const suggestion = trustedPageRuleBookDemoReply(locale, DEMO_URL);
    assert.ok(suggestion);
    assert.equal(isSafeStructuredBookingCta(suggestion, DEMO_URL), true);
    assert.doesNotMatch(suggestion, /whachatcrm\.com\/contact/);
    const sent = gateFor(book.parsed.message, book.current, {
      suggestion,
      businessKnowledge: FIVE_GAPS,
    });
    assert.equal(sent.allowed, true);
    assert.equal(sent.reason, "ok_structured_booking");
    assert.equal(sent.missingRequired.length > 1, true);
    assert.equal(sent.pageActionValidated, true);
  }
});

test("unsafe booking drafts and untrusted URLs remain held", () => {
  const book = widgetInbound({
    message: "Book a demo",
    actionIndex: HOMEPAGE_PAGE_RULE_ACTION.bookDemo,
  });
  const contactDraft = `Book here:\n${CONTACT_CTA}`;
  assert.equal(isSafeStructuredBookingCta(contactDraft, DEMO_URL), false);
  const heldUrl = gateFor(book.parsed.message, book.current, { suggestion: contactDraft });
  assert.equal(heldUrl.allowed, false);
  assert.equal(heldUrl.reason, "missing_required_gt_one");
  const inventedTime = `See you Monday at 3:00 pm.\n${DEMO_URL}`;
  assert.equal(isSafeStructuredBookingCta(inventedTime, DEMO_URL), false);
  const heldUnsafe = gateFor(book.parsed.message, book.current, { suggestion: inventedTime });
  assert.equal(heldUnsafe.allowed, false);
});

test("Find my solution starts needs-discovery by semantic kind", () => {
  for (const locale of ["en", "es", "he"] as const) {
    const labels = localeLabels(locale);
    const find = widgetInbound({
      message: labels[HOMEPAGE_PAGE_RULE_ACTION.findSolution],
      actionIndex: HOMEPAGE_PAGE_RULE_ACTION.findSolution,
      locale,
      parentUrl: locale === "en" ? HOME : locale === "es" ? HOME_ES : HOME_HE,
    });
    assert.equal(find.current.kind, "find_solution");
    const question = trustedPageRuleFindSolutionReply(locale);
    assert.match(question, /business|negocio|עסק/i);
    assert.match(question, /problem|problema|בעיה/i);
    const sent = gateFor(find.parsed.message, find.current, { suggestion: question, grounded: true });
    assert.equal(sent.allowed, true);
    assert.equal(sent.reason, "ok_validated_page_action");
    const prompt = chatbotCompletionPromptRules({
      inbound: labels[HOMEPAGE_PAGE_RULE_ACTION.findSolution],
      pageActionKind: "find_solution",
    });
    assert.match(prompt, /business type/);
  }
});

test("typed labels and forged index/label/canonical intent stay untrusted", () => {
  const typed = widgetInbound({ message: "Features & pricing" });
  assert.equal(typed.current.trusted, false);
  assert.equal(gateFor(typed.parsed.message, typed.current).reason, "conversation_too_short");
  const forged = widgetInbound({
    message: localeLabels("en")[HOMEPAGE_PAGE_RULE_ACTION.features],
    actionIndex: HOMEPAGE_PAGE_RULE_ACTION.bookDemo,
    canonicalIntent: "book_demo",
  });
  assert.equal(forged.validated, null);
  const wrongPage = widgetInbound({
    message: "Book a demo",
    actionIndex: HOMEPAGE_PAGE_RULE_ACTION.bookDemo,
    parentUrl: "https://www.whachatcrm.com/pricing",
  });
  assert.equal(wrongPage.validated, null);
  const evil = widgetInbound({
    message: "Book a demo",
    actionIndex: 2,
    originAuthorized: false,
  });
  assert.equal(evil.validated, null);
});

test("mobile and desktop payloads resolve to the same semantic kinds; polling shows outbound", () => {
  const desktop = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: "Features & pricing",
    parentUrl: HOME,
    locale: "en",
    pageRuleAction: { actionIndex: 0 },
  });
  const mobile = parseWebchatInboundBody({
    visitorId: createWebchatVisitorId(),
    message: "Features & pricing",
    parentUrl: HOME,
    locale: "en",
    pageRuleAction: { actionIndex: 0 },
  });
  assert.equal(desktop.ok && mobile.ok, true);
  if (!desktop.ok || !mobile.ok) throw new Error("parse");
  assert.equal(desktop.data.pageRuleActionIndex, 0);
  assert.equal(mobile.data.pageRuleActionIndex, 0);
  assert.equal(desktop.data.parentUrl, mobile.data.parentUrl);
  assert.equal(desktop.data.message, mobile.data.message);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  const send = frame.slice(frame.indexOf("const sendMessage"), frame.indexOf("const handleButtonClick"));
  assert.match(send, /pageRuleAction: \{ actionIndex: meta\.pageRuleActionIndex \}/);
  assert.doesNotMatch(send, /composerIsMobile/);
  const inbound = { id: "in-1", direction: "inbound" as const, content: "Book a demo", contentType: "text" };
  const outbound = {
    id: "out-1",
    direction: "outbound" as const,
    content: trustedPageRuleBookDemoReply("en", DEMO_URL),
    contentType: "text",
  };
  const merged = mergeWebchatPolledMessages([inbound], [inbound, outbound]);
  assert.equal(merged.some((m) => m.id === "out-1"), true);
  const publicMsgs = toPublicWebchatMessages([
    { id: "in-1", direction: "inbound", content: "Book a demo", contentType: "text", createdAt: new Date().toISOString() },
    { id: "out-1", direction: "outbound", content: outbound.content, contentType: "text", createdAt: new Date().toISOString() },
  ]);
  assert.equal(publicMsgs.find((m) => m.id === "out-1")?.direction, "outbound");
  assert.match(String(publicMsgs.find((m) => m.id === "out-1")?.content), /calendly\.com/);
});

test("duplicate inbound sends once; Pricing compare/savings/booking kinds stay distinct", async () => {
  const pricing = matchWidgetPageRule({ pageRules: [PRICING_PAGE_RULE_FIXTURE] }, "https://www.whachatcrm.com/pricing", "en");
  assert.equal(classifyPageRuleActionKindFromRule(pricing!, PRICING_PAGE_RULE_ACTION.compare), "compare_plans");
  assert.equal(classifyPageRuleActionKindFromRule(pricing!, PRICING_PAGE_RULE_ACTION.savings), "calculate_savings");
  assert.equal(classifyPageRuleActionKindFromRule(pricing!, PRICING_PAGE_RULE_ACTION.bookDemo), "book_demo");
  const inboundMessageId = "in-dup-home-book";
  const seen = new Set<string>();
  const runAi = async (p: { inboundMessageId: string }) => {
    if (seen.has(p.inboundMessageId)) return { decision: "skip_already_replied", sent: false };
    seen.add(p.inboundMessageId);
    return { decision: "ok_structured_booking", sent: true };
  };
  const args = {
    userId: "workspace-a",
    contact: { id: "c1", userId: "workspace-a" } as Contact,
    conversation: { id: "conv-1", userId: "workspace-a", contactId: "c1" } as Conversation,
    inboundMessageId,
    inboundText: "Book a demo",
    contentType: "text",
    channel: "webchat",
    chatbotOwnsReply: false,
    turnOwner: "ai_eligible" as const,
    awayConfigured: false,
    awayReplyWillSend: false,
    widgetSettings: { enabled: true },
  };
  const first = await dispatchWebchatInboundAi(args, { runAi });
  const second = await dispatchWebchatInboundAi(args, { runAi });
  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(seen.size, 1);
  assert.equal(webchatAutoSendIdempotencyKey("workspace-a", inboundMessageId), `webchat_ai:workspace-a:${inboundMessageId}`);
});

test("aliases, RTL, savings journey, and anonymous identity remain intact", () => {
  const matched = matchWidgetPageRule(SETTINGS, HOME_HE, "he");
  assert.equal(matched?.ruleKey, KEY);
  const journey = startPricingSavingsJourney({
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    ruleKey: "pathname:/pricing",
    actionIndex: 1,
    originInboundId: "in-sav",
  });
  assert.equal(journey.kind, "pricing_savings");
  assert.equal(isValidIdentityName("Features & pricing"), null);
  assert.equal(isValidIdentityName("Find my solution"), null);
  assert.equal(isValidIdentityName("Book a demo"), null);
  assert.equal(isValidIdentityName("Encontrar mi solución"), null);
  const withoutKinds = validateWidgetPageRules([
    {
      urlContains: "/",
      matchType: "pathname",
      urlAliases: ["/es", "/he"],
      suggestedQuestions: ["Features & pricing", "Find my solution", "Book a demo"],
    },
  ]);
  assert.equal(withoutKinds.ok, true);
  const home = matchWidgetPageRule({ pageRules: withoutKinds.ok ? withoutKinds.rules : [] }, HOME, "en");
  assert.equal(classifyPageRuleActionKindFromRule(home!, 0), "features_pricing");
  const src = read("server/aiService.ts");
  assert.match(src, /FACT_AMOUNT_RETRY_INSTRUCTION/);
  assert.match(src, /trustedPageRuleBookDemoReply/);
  assert.match(src, /selectedEvidenceCategories/);
  assert.match(src, /assembleFeaturesPricingReply/);
  assert.match(src, /isRoboticFeaturesPricingDraft/);
  const enrollments = read("server/routes/campaignEnrollments.ts");
  assert.match(enrollments, /storage\.getCampaignEnrollmentsForContact/);
  assert.doesNotMatch(enrollments.slice(0, 40), /import \{[^}]*storage/);
});

function publishedPlan(name: string, data: Record<string, unknown>) {
  return {
    fact: {
      id: `fact-${name}`,
      factType: "pricing_plan" as const,
      factKey: `pricing_plan:${name.toLowerCase()}`,
      data,
      state: "published" as const,
      proposedAction: null,
      origin: "website_verified" as const,
      confidence: 0.9,
      isPinned: false,
      userEdited: false,
      conflictGroup: null,
      conflictResolution: null,
      supersededByFactId: null,
      sourceId: "src-pricing",
      sourceUrl: "https://www.whachatcrm.com/pricing",
      sourceTitle: "Pricing",
      excerpt: null,
      provenance: [],
      firstSeenAt: "2026-08-01T00:00:00.000Z",
      lastVerifiedAt: "2026-09-01T00:00:00.000Z",
      publishedAt: "2026-09-01T00:00:00.000Z",
      retiredAt: null,
    },
    freshness: { verifiedAt: "2026-09-01T00:00:00.000Z", ageDays: 1, ttlDays: 30, tier: "fresh" as const },
    precedence: 1,
    relevanceRank: 0,
    lexicalOverlap: 1,
  };
}

const PRODUCTION_SHAPED_PLANS = [
  publishedPlan("Pro", {
    name: "Pro",
    price: { amount: 49, currency: "USD", billingPeriod: "month" },
    additionalPrices: [{ amount: 490, currency: "USD", billingPeriod: "year" }],
    priceQualifier: "exact",
    benefits: [
      "14-day free Pro trial",
      "AI Brain included",
      "0% markup on Meta fees",
      "No setup fees",
      "AI Brain included with Pro",
      "0% WhachatCRM markup on Meta conversation fees",
    ],
  }),
  publishedPlan("Free", {
    name: "Free",
    price: { amount: 0, currency: "USD", billingPeriod: "month" },
    additionalPrices: [],
    priceQualifier: "exact",
    benefits: [
      "Free and Pro plans with clear conversation and user limits",
      "Integrations and basic WhatsApp templates on Free",
      "Prospect AI included on every plan",
    ],
  }),
];

test("Features & pricing formatter synthesizes Free/Pro once without USD-per-month catalog dump", () => {
  const robotic =
    "Pro is USD 49 per month. It includes: 14-day free Pro trial · AI Brain included · 0% markup on Meta fees · No setup fees; AI Brain included with Pro; 0% WhachatCRM markup on Meta conversation fees. Free is USD 0 per month. It includes: Free and Pro plans with clear conversation and user limits; Integrations and basic WhatsApp templates on Free; Prospect AI included on every plan.";
  assert.equal(isRoboticFeaturesPricingDraft(robotic), true);
  const bundle = buildTurnEvidenceBundle({
    userId: "tenant-a",
    retrieved: PRODUCTION_SHAPED_PLANS,
    websiteKnowledgeText: "Free is $0/month. Pro is $49/month or $490/year.",
  });
  const en = assembleFeaturesPricingReply({
    retrieved: PRODUCTION_SHAPED_PLANS,
    locale: "en",
    bundle,
  });
  assert.ok(en);
  assert.equal(isRoboticFeaturesPricingDraft(en!), false);
  assert.equal(
    isDraftAmountGrounded({
      draft: en!,
      retrieved: PRODUCTION_SHAPED_PLANS,
      bundle,
    }),
    true,
  );
  assert.match(en!, /Free — \$0\/month/);
  assert.match(en!, /Pro — \$49\/month, or \$490\/year/);
  assert.equal((en!.match(/\$49\/month/g) || []).length, 1);
  assert.equal((en!.match(/\$490\/year/g) || []).length, 1);
  assert.equal((en!.match(/AI Brain/gi) || []).length, 1);
  assert.equal((en!.match(/0%/g) || []).length, 1);
  assert.match(en!, /Includes integrations and basic WhatsApp templates/);
  assert.match(en!, /Includes AI Brain, a 14-day Pro trial, and 0% WhachatCRM markup on Meta conversation fees/);
  assert.match(en!, /Prospect AI is available on every plan, and there are no setup fees/);
  assert.doesNotMatch(en!, /USD 49 per month/);
  assert.doesNotMatch(en!, /It includes:/);
  assert.doesNotMatch(en!, /on Free/);
  assert.doesNotMatch(en!, /included with Pro/);
  assert.doesNotMatch(en!, /^or /m);
  assert.doesNotMatch(en!, /clear conversation and user limits/);
  assert.doesNotMatch(en!, /factKey|tenant_chunk|VERIFIED BUSINESS/);
  assert.doesNotMatch(en!, /Integrations and basic WhatsApp templates on Free/);
  assert.ok(en!.includes("\n"));
  assert.ok(en!.length < 700);
  assert.match(en!, /side-by-side comparison or a savings estimate/);
  const factsOnly = buildTurnEvidenceBundle({
    userId: "tenant-a",
    retrieved: PRODUCTION_SHAPED_PLANS,
  });
  assert.equal(
    isDraftAmountGrounded({
      draft: en!,
      retrieved: PRODUCTION_SHAPED_PLANS,
      bundle: factsOnly,
    }),
    true,
  );
  const es = assembleFeaturesPricingReply({ retrieved: PRODUCTION_SHAPED_PLANS, locale: "es", bundle: factsOnly });
  const he = assembleFeaturesPricingReply({ retrieved: PRODUCTION_SHAPED_PLANS, locale: "he", bundle: factsOnly });
  assert.ok(es);
  assert.ok(he);
  assert.match(es!, /\$49\/mes, o \$490\/año/);
  assert.match(es!, /\$0\/mes/);
  assert.match(es!, /Incluye integraciones y plantillas básicas de WhatsApp/);
  assert.match(es!, /Incluye AI Brain, una prueba Pro de 14 días y 0% de recargo de WhachatCRM en las tarifas de conversación de Meta/);
  assert.ok(es!.includes("\n"));
  assert.equal(isRoboticFeaturesPricingDraft(es!), false);
  assert.doesNotMatch(es!, /USD 49 per month/);
  assert.equal(isDraftAmountGrounded({ draft: es!, retrieved: PRODUCTION_SHAPED_PLANS, bundle: factsOnly }), true);
  assert.match(he!, /\$49 לחודש, או \$490 לשנה/);
  assert.match(he!, /\$0 לחודש/);
  assert.match(he!, /כולל אינטגרציות ותבניות WhatsApp בסיסיות/);
  assert.ok(he!.includes("\n"));
  assert.equal(isRoboticFeaturesPricingDraft(he!), false);
  assert.equal(isDraftAmountGrounded({ draft: he!, retrieved: PRODUCTION_SHAPED_PLANS, bundle: factsOnly }), true);
  assert.ok(es!.length < 700);
  assert.ok(he!.length < 700);
  const partial = assembleFeaturesPricingReply({
    retrieved: [PRODUCTION_SHAPED_PLANS[1]],
    locale: "en",
    bundle: buildTurnEvidenceBundle({
      userId: "tenant-a",
      retrieved: [PRODUCTION_SHAPED_PLANS[1]],
    }),
  });
  assert.ok(partial);
  assert.match(partial!, /Free — \$0\/month/);
  assert.match(partial!, /Includes integrations and basic WhatsApp templates/);
  assert.doesNotMatch(partial!, /on Free/);
  assert.doesNotMatch(partial!, /\$49/);
  assert.equal(isRoboticFeaturesPricingDraft(partial!), false);
  const inventedHeld = gateFor("Features & pricing", widgetInbound({
    message: "Features & pricing",
    actionIndex: 0,
  }).current, {
    suggestion: "Pro is $999/month.",
    groundingViolations: ["unsupported_amount"],
  });
  assert.equal(inventedHeld.reason, "grounding_violation:unsupported_amount");
});
