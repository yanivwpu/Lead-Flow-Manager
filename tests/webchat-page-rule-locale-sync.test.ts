/**
 * Same Page Rule, live display locale: SPA alias navigation updates UI
 * without a new session or a new rule key.
 * Run: npx tsx --test tests/webchat-page-rule-locale-sync.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  nextWidgetHrefLocale,
  resolveWidgetDisplayLocale,
  widgetChromeDir,
} from "@shared/webchatWidgetLocale";
import {
  buildWebchatPageContextMessage,
  effectivePageContextKey,
  parseTrustedParentPageContextMessage,
} from "@shared/webchatPageContextMessage";
import {
  decidePageRuleTeaser,
  decidePageRuleTeaserLocaleSync,
  resolveLocalizedPageRuleTeaser,
} from "@shared/webchatPageRuleTeaser";
import {
  matchWidgetPageRule,
  pageRuleStableKey,
  validatePageRuleInboundAction,
} from "@shared/webchatPageRuleMatch";
import { decidePageRuleEngagement } from "@shared/webchatPageRuleEngagement";
import { startPricingSavingsJourney } from "@shared/webchatActiveJourney";
import { resolveTrustedPageRuleInboundAction } from "@shared/webchatPageRuleAction";
import { PRICING_PAGE_RULE_ACTION, PRICING_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_TEASER } from "@shared/webchatPageRuleFixtures";
import { visitorSafeWidgetPageRules } from "@shared/webchatWidgetLauncher";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PRIMARY = "https://www.whachatcrm.com/pricing";
const ES = "https://www.whachatcrm.com/es/pricing";
const HE = "https://www.whachatcrm.com/he/pricing";
const ALIASED = { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing", "/he/pricing"] };
const SETTINGS = { pageRules: [ALIASED] };
const KEY = pageRuleStableKey({ urlContains: "/pricing", matchType: "pathname" });

test("direct loads resolve EN/ES/HE from the URL while keeping one rule key", () => {
  const session = { lastPrefixedLocale: "" };
  assert.equal(nextWidgetHrefLocale(PRIMARY, session).locale, "en");
  assert.equal(nextWidgetHrefLocale(ES, session).locale, "es");
  assert.equal(nextWidgetHrefLocale(HE, session).locale, "he");
  for (const [href, locale] of [
    [PRIMARY, "en"],
    [ES, "es"],
    [HE, "he"],
  ] as const) {
    const hit = matchWidgetPageRule(SETTINGS, href, locale);
    assert.equal(hit?.ruleKey, KEY);
    assert.equal(hit?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings], ALIASED.localized[locale].suggestedQuestions[1]);
  }
});

test("same-session alias navigation updates display locale without a new rule identity", () => {
  let session = { lastPrefixedLocale: "" as string };
  session = { lastPrefixedLocale: nextWidgetHrefLocale(HE, session).lastPrefixedLocale };
  assert.equal(session.lastPrefixedLocale, "he");
  const toEs = nextWidgetHrefLocale(ES, session, { explicit: "he", htmlLang: "he" });
  assert.equal(toEs.locale, "es");
  session = { lastPrefixedLocale: toEs.lastPrefixedLocale };
  const toEn = nextWidgetHrefLocale(PRIMARY, session, { explicit: "es", htmlLang: "es" });
  assert.equal(toEn.locale, "en");
  assert.equal(toEn.lastPrefixedLocale, "");
  assert.equal(
    resolveWidgetDisplayLocale({ href: ES, explicit: "he" }),
    "es",
  );
});

test("query/hash-only changes stay deduped; locale is a separate page-context dimension", () => {
  assert.equal(
    effectivePageContextKey(`${PRIMARY}?utm=1`, "Pricing", "en"),
    effectivePageContextKey(PRIMARY, "Pricing", "en"),
  );
  assert.notEqual(
    effectivePageContextKey(HE, "Pricing", "he"),
    effectivePageContextKey(ES, "Pricing", "es"),
  );
  assert.notEqual(
    effectivePageContextKey(PRIMARY, "Pricing", "en"),
    effectivePageContextKey(PRIMARY, "Pricing", "he"),
  );
});

test("pending / visible / consumed teasers stay one-shot across aliases", () => {
  assert.equal(
    decidePageRuleTeaserLocaleSync({
      localeChanged: true,
      sameRuleKey: true,
      teaserVisible: false,
      alreadyShownForRule: false,
      pending: true,
    }),
    "reschedule-pending",
  );
  assert.equal(
    decidePageRuleTeaserLocaleSync({
      localeChanged: true,
      sameRuleKey: true,
      teaserVisible: true,
      alreadyShownForRule: true,
      pending: false,
    }),
    "update-visible",
  );
  assert.equal(
    decidePageRuleTeaserLocaleSync({
      localeChanged: true,
      sameRuleKey: true,
      teaserVisible: false,
      alreadyShownForRule: true,
      pending: false,
    }),
    "keep-consumed",
  );
  assert.equal(
    decidePageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: false,
      deviceAllowed: true,
      ruleKey: KEY,
      teaserText: PRICING_PAGE_RULE_TEASER.es,
      alreadyShownForRule: true,
      cooldownActive: false,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "he", ...ALIASED }), PRICING_PAGE_RULE_TEASER.he);
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "es", ...ALIASED }), PRICING_PAGE_RULE_TEASER.es);
});

test("empty chat updates localized actions; existing transcript and savings journey stay intact", () => {
  const empty = decidePageRuleEngagement({
    hasMatch: true,
    ruleKey: KEY,
    alreadyShown: true,
    activeThisMount: true,
    transcriptCount: 0,
    humanTakeover: false,
    pendingVisitorInput: false,
  });
  assert.equal(empty, "empty");
  const existing = decidePageRuleEngagement({
    hasMatch: true,
    ruleKey: KEY,
    alreadyShown: true,
    activeThisMount: true,
    transcriptCount: 4,
    humanTakeover: false,
    pendingVisitorInput: false,
  });
  assert.equal(existing, "card");
  const he = matchWidgetPageRule(SETTINGS, HE, "he");
  const es = matchWidgetPageRule(SETTINGS, ES, "es");
  assert.equal(he?.ruleKey, es?.ruleKey);
  const journey = startPricingSavingsJourney({
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    ruleKey: he!.ruleKey,
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    originInboundId: "in-he",
    locale: "he",
  });
  assert.equal(journey.ruleKey, KEY);
  const validated = validatePageRuleInboundAction({
    matched: es!,
    message: ALIASED.localized.es.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings],
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
  });
  assert.equal(validated?.ruleKey, KEY);
  assert.equal(validated?.actionIndex, PRICING_PAGE_RULE_ACTION.savings);
  assert.equal(
    resolveTrustedPageRuleInboundAction({
      originAuthorized: true,
      settings: SETTINGS,
      parentUrl: ES,
      locale: "es",
      message: ALIASED.localized.es.suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo],
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    })?.kind,
    "book_demo",
  );
  assert.equal(
    validatePageRuleInboundAction({
      matched: es!,
      message: ALIASED.localized.es.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings],
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    }),
    null,
  );
});

test("RTL/LTR follows display locale; unauthorized page-context stays rejected", () => {
  assert.equal(widgetChromeDir("he"), "rtl");
  assert.equal(widgetChromeDir(resolveWidgetDisplayLocale({ href: ES })), "ltr");
  assert.equal(widgetChromeDir(resolveWidgetDisplayLocale({ href: PRIMARY })), "ltr");
  const trusted = buildWebchatPageContextMessage({
    widgetId: "wgt_abc",
    href: ES,
    locale: "es",
  });
  assert.equal(trusted?.locale, "es");
  const parent = {};
  assert.ok(
    parseTrustedParentPageContextMessage(
      { origin: "https://www.whachatcrm.com", source: parent, data: trusted },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.whachatcrm.com", expectedSource: parent },
    ),
  );
  assert.equal(
    parseTrustedParentPageContextMessage(
      { origin: "https://evil.example", source: parent, data: trusted },
      { widgetId: "wgt_abc", expectedParentOrigin: "https://www.whachatcrm.com", expectedSource: parent },
    ),
    null,
  );
});

test("visitor-safe rules ship locale maps; widget.js hooks history before iframe and syncs locale", () => {
  const rules = visitorSafeWidgetPageRules(SETTINGS, "he");
  assert.equal(rules[0]?.teaserGreeting, PRICING_PAGE_RULE_TEASER.he);
  assert.equal(rules[0]?.localized?.es?.teaserGreeting, PRICING_PAGE_RULE_TEASER.es);
  assert.equal(rules[0]?.localized?.en?.suggestedQuestions?.[PRICING_PAGE_RULE_ACTION.savings], "Calculate my savings");
  const js = buildWebchatPublicScript({ origin: "https://app.example.com" });
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /localizedRuleCopy/);
  assert.match(js, /lastPrefixedLocale/);
  assert.match(js, /pageContextDedupeKey/);
  assert.match(js, /lastNavContextKey/);
  assert.match(js, /teaserNavKey/);
  assert.match(js, /data-wcw-teaser-reason/);
  assert.match(js, /applyDisplayDir/);
  assert.match(js, /syncVisiblePageTeaser/);
  const reveal = js.slice(js.indexOf("function reveal()"), js.indexOf("function scheduleReveal()"));
  assert.match(reveal, /hookHistory/);
  const sync = js.slice(js.indexOf("function syncFrameSrc()"), js.indexOf("function loadIframe()"));
  assert.doesNotMatch(sync, /fr\.src\s*=/);
  const frame = read("client/src/pages/WidgetFrame.tsx");
  assert.match(frame, /parentPageLocale/);
  assert.match(frame, /nextWidgetHrefLocale/);
  assert.doesNotMatch(frame.slice(frame.indexOf("fetch(settingsUrl"), frame.indexOf("}, [userId, parentPageHref")), /setMessages\(/);
});
