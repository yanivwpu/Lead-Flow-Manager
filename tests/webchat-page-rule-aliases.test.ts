/**
 * Exact-path page-rule aliases: matching, identity, locale, validation, editor.
 * Does not mutate production tenant settings.
 * Run: npx tsx --test tests/webchat-page-rule-aliases.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectPageRuleAliasFragments,
  matchWidgetPageRule,
  mergeShownPageRuleKeys,
  pageRuleMatchesHref,
  pageRulePathInputIssue,
  pageRuleStableKey,
  pageRuleUrlFieldLabel,
  pageRulesHavePathInputIssues,
  sanitizePageRuleUrlAliases,
  validatePageRuleInboundAction,
  WIDGET_PAGE_RULE_MAX_ALIASES,
} from "@shared/webchatPageRuleMatch";
import {
  classifyPageRuleActionKindFromRule,
  resolveTrustedPageRuleInboundAction,
} from "@shared/webchatPageRuleAction";
import {
  decidePageRuleTeaser,
  resolveLocalizedPageRuleTeaser,
} from "@shared/webchatPageRuleTeaser";
import { startPricingSavingsJourney } from "@shared/webchatActiveJourney";
import { PRICING_PAGE_RULE_ACTION, PRICING_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_TEASER } from "@shared/webchatPageRuleFixtures";
import { mergeNeutralWidgetSettings, validateWidgetPageRules } from "@shared/webchatWidgetSettings";
import { visitorSafeWidgetPageRules } from "@shared/webchatWidgetLauncher";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";
import { originAllowed } from "../server/webchatAccess";
import { resolveWidgetStaticLocale } from "@shared/webchatWidgetLocale";
import { isSafeStructuredBookingCta } from "../server/aiAutoSendGate";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const DEMO_URL = "https://calendly.com/yanivharamaty/whachatcrm-live-product-demo";
const PRIMARY = "https://www.whachatcrm.com/pricing";
const ES = "https://www.whachatcrm.com/es/pricing";
const HE = "https://www.whachatcrm.com/he/pricing";
const ALIASED_PRICING = {
  ...PRICING_PAGE_RULE_FIXTURE,
  urlAliases: ["/es/pricing", "/he/pricing"],
};
const ALIASED_SETTINGS = { pageRules: [ALIASED_PRICING] };
const PRIMARY_KEY = pageRuleStableKey({ urlContains: "/pricing", matchType: "pathname" });

test("legacy Exact path rules without aliases stay unchanged", () => {
  const rule = { urlContains: "/pricing", matchType: "pathname" as const };
  assert.equal(pageRuleMatchesHref(rule, PRIMARY), true);
  assert.equal(pageRuleMatchesHref(rule, `${PRIMARY}?plan=pro#faq`), true);
  assert.equal(pageRuleMatchesHref(rule, "https://www.whachatcrm.com/pricing-guide"), false);
  assert.equal(pageRuleMatchesHref(rule, ES), false);
  assert.equal(pageRuleMatchesHref(rule, HE), false);
  assert.equal(pageRuleMatchesHref(rule, "https://www.whachatcrm.com/?next=/pricing"), false);
  const roundTrip = validateWidgetPageRules([{ ...PRICING_PAGE_RULE_FIXTURE }]);
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok) {
    assert.equal("urlAliases" in roundTrip.rules[0], false);
    assert.equal(roundTrip.rules[0]?.urlContains, "/pricing");
    assert.equal(roundTrip.rules[0]?.matchType, "pathname");
  }
  const merged = mergeNeutralWidgetSettings({
    enabled: true,
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.equal("urlAliases" in (merged.pageRules as object[])[0], false);
});

test("Exact primary and localized aliases match; query/hash ignored; substring does not", () => {
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, PRIMARY), true);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, ES), true);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, HE), true);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, `${ES}?plan=pro#faq`), true);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, `${HE}#cta`), true);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, "https://www.whachatcrm.com/pricing-guide"), false);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, "https://www.whachatcrm.com/es/pricing-guide"), false);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, "https://www.whachatcrm.com/he/pricing-guide"), false);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, "https://www.whachatcrm.com/?next=/pricing"), false);
  assert.equal(pageRuleMatchesHref(ALIASED_PRICING, "https://www.whachatcrm.com/contact"), false);
});

test("aliases resolve to the primary stable rule key", () => {
  assert.equal(PRIMARY_KEY, "pathname:/pricing");
  for (const href of [PRIMARY, ES, HE, `${ES}?x=1`]) {
    const hit = matchWidgetPageRule(ALIASED_SETTINGS, href, "en");
    assert.equal(hit?.ruleKey, PRIMARY_KEY);
    assert.equal(hit?.urlContains, "/pricing");
    assert.deepEqual(hit?.urlAliases, ["/es/pricing", "/he/pricing"]);
  }
});

test("locale after alias match uses trusted locale, not the alias string", () => {
  const en = matchWidgetPageRule(ALIASED_SETTINGS, PRIMARY, resolveWidgetStaticLocale({ pathname: "/pricing" }));
  const es = matchWidgetPageRule(ALIASED_SETTINGS, ES, resolveWidgetStaticLocale({ pathname: "/es/pricing" }));
  const he = matchWidgetPageRule(ALIASED_SETTINGS, HE, resolveWidgetStaticLocale({ pathname: "/he/pricing" }));
  assert.match(en?.greeting || "", /Comparing plans/);
  assert.match(es?.greeting || "", /Comparando planes/);
  assert.match(he?.greeting || "", /משווים תוכניות/);
  assert.equal(en?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings], "Calculate my savings");
  assert.equal(es?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings], "Calcular mi ahorro");
  assert.equal(he?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo], "קביעת הדגמה");
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "es", ...ALIASED_PRICING }), PRICING_PAGE_RULE_TEASER.es);
  assert.equal(resolveLocalizedPageRuleTeaser({ locale: "he", ...ALIASED_PRICING }), PRICING_PAGE_RULE_TEASER.he);
});

test("validated actions from each alias start the same kind and savings journey identity", () => {
  for (const [href, locale] of [
    [PRIMARY, "en"],
    [ES, "es"],
    [HE, "he"],
  ] as const) {
    const label = PRICING_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions[PRICING_PAGE_RULE_ACTION.savings];
    const action = resolveTrustedPageRuleInboundAction({
      originAuthorized: true,
      settings: ALIASED_SETTINGS,
      parentUrl: href,
      locale,
      message: label,
      actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    });
    assert.equal(action?.ruleKey, PRIMARY_KEY);
    assert.equal(action?.kind, "calculate_savings");
    assert.equal(action?.actionIndex, PRICING_PAGE_RULE_ACTION.savings);
    const bookLabel = PRICING_PAGE_RULE_FIXTURE.localized[locale].suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo];
    const book = resolveTrustedPageRuleInboundAction({
      originAuthorized: true,
      settings: ALIASED_SETTINGS,
      parentUrl: href,
      locale,
      message: bookLabel,
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    });
    assert.equal(book?.kind, "book_demo");
    assert.equal(book?.ruleKey, PRIMARY_KEY);
    const matched = matchWidgetPageRule(ALIASED_SETTINGS, href, locale);
    assert.equal(classifyPageRuleActionKindFromRule(matched!, PRICING_PAGE_RULE_ACTION.bookDemo), "book_demo");
  }
  const heMatch = matchWidgetPageRule(ALIASED_SETTINGS, HE, "he");
  const journey = startPricingSavingsJourney({
    userId: "tenant-a",
    visitorId: "visitor-a",
    conversationId: "conv-a",
    ruleKey: heMatch!.ruleKey,
    actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    originInboundId: "in-he",
    locale: "he",
  });
  const esMatch = matchWidgetPageRule(ALIASED_SETTINGS, ES, "es");
  assert.equal(esMatch?.ruleKey, journey.ruleKey);
  assert.equal(journey.ruleKey, PRIMARY_KEY);
  assert.equal(isSafeStructuredBookingCta(`Happy to book.\n${DEMO_URL}`, DEMO_URL), true);
});

test("forged label/index/canonical intent and unauthorized origin stay rejected", () => {
  const es = matchWidgetPageRule(ALIASED_SETTINGS, ES, "es");
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
      message: "Calcular mi ahorro",
      actionIndex: PRICING_PAGE_RULE_ACTION.bookDemo,
    }),
    null,
  );
  assert.equal(
    resolveTrustedPageRuleInboundAction({
      originAuthorized: true,
      settings: ALIASED_SETTINGS,
      parentUrl: ES,
      locale: "es",
      message: "calculate_savings",
      actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    }),
    null,
  );
  assert.equal(
    resolveTrustedPageRuleInboundAction({
      originAuthorized: false,
      settings: ALIASED_SETTINGS,
      parentUrl: ES,
      locale: "es",
      message: "Calcular mi ahorro",
      actionIndex: PRICING_PAGE_RULE_ACTION.savings,
    }),
    null,
  );
  assert.equal(matchWidgetPageRule(ALIASED_SETTINGS, "https://www.whachatcrm.com/contact", "es"), null);
  const allowed = ["https://www.whachatcrm.com", "https://whachatcrm.com"];
  assert.equal(originAllowed(allowed, "https://www.whachatcrm.com", null), true);
  assert.equal(originAllowed(allowed, "https://evil.example.com", null), false);
});

test("duplicate, empty, malformed, excessive, and comma-separated aliases are rejected or ignored", () => {
  assert.match(pageRulePathInputIssue("/es/pricing,/he/pricing") || "", /separately/);
  assert.equal(pageRulesHavePathInputIssues([{ urlContains: "/pricing", urlAliases: ["/es/pricing, /he"] }]), true);
  const commaPrimary = validateWidgetPageRules([
    { urlContains: "/pricing,/es/pricing", matchType: "pathname", greeting: "Hi" },
  ]);
  assert.equal(commaPrimary.ok, false);
  const commaAlias = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing,/he/pricing"] },
  ]);
  assert.equal(commaAlias.ok, false);
  const dupAlias = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing", "/es/pricing"] },
  ]);
  assert.equal(dupAlias.ok, false);
  const dupPrimary = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/pricing"] },
  ]);
  assert.equal(dupPrimary.ok, false);
  const slashDup = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/pricing/"] },
  ]);
  assert.equal(slashDup.ok, false);
  const localizedSlash = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing/"] },
  ]);
  assert.equal(localizedSlash.ok, true);
  const crossRule = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing"] },
    { urlContains: "/es/pricing", matchType: "pathname", greeting: "Other" },
  ]);
  assert.equal(crossRule.ok, false);
  const tooMany = sanitizePageRuleUrlAliases(
    Array.from({ length: WIDGET_PAGE_RULE_MAX_ALIASES + 1 }, (_, i) => `/p${i}`),
    "/pricing",
  );
  assert.ok(tooMany.error);
  const emptyDraft = validateWidgetPageRules([
    { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["", "  ", "/es/pricing"] },
  ]);
  assert.equal(emptyDraft.ok, true);
  if (emptyDraft.ok) {
    assert.deepEqual(emptyDraft.rules[0]?.urlAliases, ["/es/pricing"]);
  }
  const containsIgnores = validateWidgetPageRules([
    { urlContains: "/pricing", greeting: "Hi", urlAliases: ["/es/pricing"] },
  ]);
  assert.equal(containsIgnores.ok, true);
  if (containsIgnores.ok) {
    assert.equal("urlAliases" in containsIgnores.rules[0], false);
  }
  assert.equal(
    pageRuleMatchesHref(
      { urlContains: "/pricing", matchType: "contains", urlAliases: ["/contact"] },
      "https://www.whachatcrm.com/contact",
    ),
    false,
  );
  assert.equal(
    pageRuleMatchesHref(
      { urlContains: "/blog", matchType: "pathname_prefix", urlAliases: ["/pricing"] },
      PRIMARY,
    ),
    false,
  );
  assert.deepEqual(
    collectPageRuleAliasFragments({
      urlContains: "/pricing",
      matchType: "pathname",
      urlAliases: [{ nope: true }, "/es/pricing", "/pricing", "/es/pricing,/he", ""],
    }),
    ["/es/pricing"],
  );
});

test("invalid sibling rules cannot stop a valid aliased rule; first match wins", () => {
  const throwing = {
    get urlContains() {
      throw new Error("bad rule");
    },
  };
  const settings = {
    pageRules: [
      throwing,
      { urlContains: "/blog", matchType: "pathname", greeting: "Blog" },
      ALIASED_PRICING,
    ],
  };
  const hit = matchWidgetPageRule(settings, ES, "es");
  assert.equal(hit?.greeting, ALIASED_PRICING.localized.es.greeting);
  assert.equal(hit?.ruleKey, PRIMARY_KEY);
  const ordered = {
    pageRules: [
      { urlContains: "/blog", matchType: "pathname", greeting: "Blog" },
      ALIASED_PRICING,
    ],
  };
  assert.equal(matchWidgetPageRule(ordered, "https://www.whachatcrm.com/blog")?.greeting, "Blog");
  assert.equal(matchWidgetPageRule(ordered, HE)?.ruleKey, PRIMARY_KEY);
});

test("teaser one-shot uses one logical rule identity across aliases", () => {
  const shown = mergeShownPageRuleKeys([], PRIMARY_KEY);
  const again = mergeShownPageRuleKeys(shown, matchWidgetPageRule(ALIASED_SETTINGS, HE, "he")?.ruleKey);
  assert.deepEqual(again, [PRIMARY_KEY]);
  assert.equal(
    decidePageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: false,
      deviceAllowed: true,
      ruleKey: PRIMARY_KEY,
      teaserText: PRICING_PAGE_RULE_TEASER.he,
      alreadyShownForRule: true,
      cooldownActive: false,
      humanTakeover: false,
      pendingVisitorInput: false,
    }),
    "none",
  );
});

test("visitor-safe payload ships aliases for Exact path only; widget.js parses and matches", () => {
  const safe = visitorSafeWidgetPageRules(ALIASED_SETTINGS, "he");
  assert.deepEqual(safe[0]?.urlAliases, ["/es/pricing", "/he/pricing"]);
  assert.equal(safe[0]?.suggestedQuestions[PRICING_PAGE_RULE_ACTION.bookDemo], "קביעת הדגמה");
  assert.equal("chatbotFlowId" in safe[0], false);
  const legacySafe = visitorSafeWidgetPageRules({ pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }] }, "en");
  assert.equal("urlAliases" in legacySafe[0], false);
  const js = buildWebchatPublicScript({ origin: "https://app.example.com" });
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /urlAliases/);
  assert.match(js, /fragmentMatches/);
  assert.match(js, /matchType \+ ':' \+ fragment/);
  assert.doesNotMatch(js.slice(js.indexOf("function ruleKey"), js.indexOf("function fallbackPageRuleTeaser")), /urlAliases/);
  const sync = js.slice(js.indexOf("function syncFrameSrc()"), js.indexOf("function loadIframe()"));
  assert.doesNotMatch(sync, /fr\.src\s*=/);
  assert.match(sync, /postPageContext/);
  const desktop = buildWebchatPublicScript({ origin: "https://app.example.com" });
  const mobile = desktop;
  assert.doesNotThrow(() => new Function(desktop));
  assert.doesNotThrow(() => new Function(mobile));
  assert.match(js, /SHOW_MOBILE/);
  assert.match(js, /SHOW_DESKTOP/);
});

test("editor labels, alias controls, autosave, and save status stay accurate", () => {
  assert.equal(pageRuleUrlFieldLabel("contains"), "URL contains");
  assert.equal(pageRuleUrlFieldLabel("pathname"), "Primary path");
  assert.equal(pageRuleUrlFieldLabel("pathname_prefix"), "Path prefix");
  assert.equal(pageRuleUrlFieldLabel(undefined), "URL contains");
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /pageRuleUrlFieldLabel\(rule\.matchType\)/);
  assert.match(read("shared/webchatPageRuleMatch.ts"), /Primary path/);
  assert.match(website, /Additional paths/);
  assert.match(website, /Add localized or alternate URLs that should use this same greeting, actions, and funnel\./);
  assert.match(website, /button-add-alias-\$\{index\}/);
  assert.match(website, /button-remove-alias-\$\{index\}-\$\{aliasIndex\}/);
  assert.match(website, /text-page-rules-save-status/);
  assert.match(website, /Saving…/);
  assert.match(website, /button-page-rules-save-retry/);
  assert.match(website, /pageRulesHavePathInputIssues/);
  assert.match(website, /schedulePageRulesDebouncedSave/);
  assert.match(website, /aliases\.length \? \{ urlAliases: aliases \}/);
  assert.match(website, /filter\(Boolean\)\.slice\(0, WIDGET_PAGE_RULE_MAX_ALIASES\)/);
  assert.match(website, /Additional paths apply only to Exact path matching and were cleared/);
  assert.match(website, /overflow-x-hidden min-w-0/);
  assert.match(website, /builderLocalizedInputProps\("he"\)/);
  assert.match(website, /dir="ltr"/);
  const routes = read("server/routes.ts");
  assert.match(routes, /urlAliases: z\.array\(z\.string\(\)\.max\(500\)\)\.max\(8\)\.optional\(\)/);
  assert.match(routes, /validateWidgetPageRules/);
});
