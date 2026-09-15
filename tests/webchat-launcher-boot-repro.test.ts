/**
 * Prove Website Chat launcher boot after Phase 1 page rules.
 * Run: npx tsx tests/webchat-launcher-boot-repro.test.ts
 */
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildWebchatPublicScript } from "../server/webchatPublicScript";
import { resolvePublicWebchatPresentation } from "../shared/webchatWidgetBranding";
import { buildWebchatChromeLayout } from "../shared/webchatWidgetChrome";
import {
  toVisitorSafeWebchatPublicBody,
  visitorRuntimeConfigFromPublicSettings,
  visitorSafeWidgetPageRules,
} from "../shared/webchatWidgetLauncher";
import { mergeNeutralWidgetSettings, validateWidgetPageRules } from "../shared/webchatWidgetSettings";
import { HOMEPAGE_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_FIXTURE, PRICING_PAGE_RULE_TEASER } from "../shared/webchatPageRuleFixtures";
import { matchWidgetPageRule } from "../shared/webchatPageRuleMatch";
import { readShownPageRuleKeys } from "../shared/webchatPageRuleEngagement";
import {
  decidePageRuleTeaser,
  explainPageRuleTeaser,
  fallbackPageRuleTeaserFromGreeting,
  PAGE_RULE_TEASER_COOLDOWN_MS,
  pageRuleTeaserCooldownActive,
  remainingPageRuleTeaserCooldownMs,
  resolveLocalizedPageRuleTeaser,
} from "../shared/webchatPageRuleTeaser";
import { publicWidgetEmbedDecision } from "../shared/webchatOriginPolicy";
import { MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS } from "../shared/marketingWebsiteChatWidget";

const WIDGET_ID = "wgt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORIGIN = "https://app.whachatcrm.com";

function publicBody(pageRules: unknown[]) {
  const settings = mergeNeutralWidgetSettings({
    enabled: true,
    allowedOrigins: ["https://www.whachatcrm.com", "https://whachatcrm.com"],
    showOnDesktop: true,
    showOnMobile: true,
    triggerType: "always",
    pageRules,
  });
  const chrome = buildWebchatChromeLayout(settings);
  const presentation = resolvePublicWebchatPresentation({ settings });
  return {
    settings,
    body: toVisitorSafeWebchatPublicBody(presentation, settings, chrome),
  };
}

function syntaxCheck(js: string) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(js);
    return { ok: true, error: "" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? `${err.name}: ${err.message}` : "error" };
  }
}

type BootOpts = {
  href: string;
  pageRules: unknown[];
  mobile?: boolean;
  historyWritable?: boolean;
  localStorageRaw?: string | null;
  sessionShown?: boolean;
  pageTeaserShown?: string[];
  pageTeaserAt?: number;
  pageTeaserRaw?: string | null;
  timerMode?: "immediate" | "queue";
  clock?: number;
  deferReveal?: boolean;
};

type QueuedTimer = { id: number; ms: number; fn: () => void };

type MockEl = {
  tag: string;
  style: { cssText: string };
  attrs: Record<string, string>;
  children: MockEl[];
  lastChild?: MockEl;
  textContent: string;
  innerHTML: string;
  src?: string;
  contentWindow?: { postMessage: (...args: unknown[]) => void };
  setAttribute: (k: string, v: string) => void;
  getAttribute: (k: string) => string | undefined;
  appendChild: (c: MockEl) => MockEl;
  addEventListener: (type: string, fn: (...args: unknown[]) => void) => void;
  listeners: Record<string, Array<(...args: unknown[]) => void>>;
};

function syncThen(value: unknown): { then: Function; catch: Function } {
  const p = {
    then(onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
      try {
        const next = onF ? onF(value) : value;
        if (next && typeof (next as { then?: unknown }).then === "function") return next;
        return syncThen(next);
      } catch (err) {
        if (onR) return syncThen(onR(err));
        return syncThen(undefined);
      }
    },
    catch(onR: (e: unknown) => unknown) {
      return p.then(undefined, onR);
    },
  };
  return p;
}

function bootWidget(opts: BootOpts) {
  const js = buildWebchatPublicScript({ origin: ORIGIN });
  const { body: settingsBody } = publicBody(opts.pageRules);
  const created: MockEl[] = [];
  const makeEl = (tag: string): MockEl => {
    const el: MockEl = {
      tag,
      style: { cssText: "" },
      attrs: {},
      children: [],
      textContent: "",
      innerHTML: "",
      listeners: {},
      setAttribute(k, v) {
        this.attrs[k] = String(v);
        if (k === "src") this.src = String(v);
      },
      getAttribute(k) {
        return this.attrs[k];
      },
      appendChild(c) {
        this.children.push(c);
        this.lastChild = c;
        return c;
      },
      addEventListener(type, fn) {
        (this.listeners[type] ||= []).push(fn);
      },
    };
    if (tag === "iframe") {
      el.contentWindow = { postMessage() {} };
      el.src = "";
    }
    return el;
  };
  const bodyEl = {
    children: created,
    appendChild(el: MockEl) {
      created.push(el);
      return el;
    },
  };
  const scriptSrc = `${ORIGIN}/widget.js?id=${WIDGET_ID}`;
  const store: Record<string, string> = {};
  if (opts.localStorageRaw != null) store[`wcw-pr-shown:${WIDGET_ID}:visitor`] = opts.localStorageRaw;
  if (opts.sessionShown) store[`wcw-teaser-${WIDGET_ID}`] = "1";
  if (opts.pageTeaserShown) {
    store[`wcw-pr-teaser:${WIDGET_ID}`] = JSON.stringify(opts.pageTeaserShown);
  }
  if (typeof opts.pageTeaserAt === "number") {
    store[`wcw-pr-teaser-at:${WIDGET_ID}`] = String(opts.pageTeaserAt);
  }
  if (opts.pageTeaserRaw != null) {
    store[`wcw-pr-teaser:${WIDGET_ID}`] = opts.pageTeaserRaw;
  }
  const storage = {
    getItem(k: string) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k: string, v: string) {
      store[k] = String(v);
    },
  };
  const loc = new URL(opts.href);
  const locationObj = {
    href: loc.href,
    pathname: loc.pathname,
    origin: loc.origin,
  };
  const applyUrl = (url: unknown) => {
    if (url == null || url === "") return;
    try {
      const next = new URL(String(url), locationObj.href);
      locationObj.href = next.href;
      locationObj.pathname = next.pathname;
      locationObj.origin = next.origin;
    } catch {
      /* ignore */
    }
  };
  const origPush = function pushState(this: unknown, ...args: unknown[]) {
    applyUrl(args[2]);
    return { kind: "push", args };
  };
  const origReplace = function replaceState(this: unknown, ...args: unknown[]) {
    applyUrl(args[2]);
    return { kind: "replace", args };
  };
  const historyObj: {
    pushState: (...args: unknown[]) => unknown;
    replaceState: (...args: unknown[]) => unknown;
  } = {
    pushState: origPush,
    replaceState: origReplace,
  };
  if (opts.historyWritable === false) {
    Object.defineProperty(historyObj, "pushState", {
      value: origPush,
      writable: false,
      configurable: false,
    });
    Object.defineProperty(historyObj, "replaceState", {
      value: origReplace,
      writable: false,
      configurable: false,
    });
  }
  const timers: QueuedTimer[] = [];
  let timerId = 1;
  const queueMode = opts.timerMode === "queue";
  let clock = opts.clock ?? 1_700_000_000_000;
  const windowListeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const ctx: Record<string, unknown> = {
    Array,
    String,
    Object,
    Boolean,
    Number,
    JSON,
    Math,
    Date: {
      now: () => clock,
    },
    Error,
    TypeError,
    URL,
    encodeURIComponent,
    decodeURIComponent,
    parseInt,
    isNaN,
    isFinite,
    Infinity,
    NaN,
    undefined,
    console,
    fetch: () =>
      syncThen({
        ok: true,
        status: 200,
        json: () => syncThen(settingsBody),
      }),
    document: {
      currentScript: { src: scriptSrc },
      body: bodyEl,
      documentElement: { lang: "en", getAttribute: () => null },
      readyState: "complete",
      title: locationObj.pathname === "/pricing" ? "Pricing" : "Home",
      referrer: "",
      createElement: makeEl,
      getElementsByTagName: (tag: string) => (tag === "script" ? [{ src: scriptSrc }] : []),
      addEventListener() {},
    },
    location: locationObj,
    history: historyObj,
    navigator: {
      userAgent: opts.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" : "Mozilla/5.0",
      language: "en-US",
      maxTouchPoints: opts.mobile ? 5 : 0,
    },
    matchMedia: (q: string) => ({
      matches: String(q).includes("max-width: 767px") ? !!opts.mobile : false,
    }),
    requestIdleCallback: (cb: () => void) => {
      if (opts.deferReveal) {
        const id = timerId++;
        timers.push({ id, ms: 1, fn: cb });
        return id;
      }
      cb();
      return 0;
    },
    setTimeout: (cb: () => void, ms?: number) => {
      if (!queueMode) {
        cb();
        return 0;
      }
      const id = timerId++;
      timers.push({ id, ms: typeof ms === "number" ? ms : 0, fn: cb });
      return id;
    },
    clearTimeout(id: number) {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    requestAnimationFrame: (cb: () => void) => cb(),
    addEventListener(type: string, fn: (...args: unknown[]) => void) {
      (windowListeners[type] ||= []).push(fn);
    },
    sessionStorage: storage,
    localStorage: storage,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { timeout: 3000 });
  const launcher = created.find((el) => el.attrs["data-testid"] === "wcw-launcher");
  const teaser = created.find((el) => el.attrs["data-wcw"] === "teaser");
  const flushTimers = (maxMs: number) => {
    const due = timers.filter((t) => t.ms <= maxMs);
    const rest = timers.filter((t) => t.ms > maxMs);
    timers.length = 0;
    timers.push(...rest);
    for (const t of due) t.fn();
  };
  const dispatchMessage = (data: unknown) => {
    for (const fn of windowListeners.message || []) {
      fn({ origin: ORIGIN, data });
    }
  };
  return {
    created,
    launcher,
    teaser,
    historyObj,
    settingsBody,
    ctx,
    js,
    store,
    locationObj,
    flushTimers,
    dispatchMessage,
    firePopState() {
      for (const fn of windowListeners.popstate || []) fn({});
    },
    advanceClock(ms: number) {
      clock += ms;
    },
  };
}

const js = buildWebchatPublicScript({ origin: ORIGIN });
const syntax = syntaxCheck(js);
assert.equal(syntax.ok, true, syntax.error);
assert.equal(/https\?:\/\/\//.test(js), false);
assert.match(js, /indexOf\('https:\/\/'\)/);
assert.match(js, /try \{ hookHistory\(\); \}/);
assert.match(js, /return ret;/);
assert.match(js, /wcw-pr-teaser/);
assert.match(js, /wcw-teaser-gate/);
assert.match(js, /teaserNavKey/);
assert.match(js, /data-wcw-teaser-reason/);
assert.match(js, /TRIGGER === 'always'/);
assert.match(js, /TRIGGER === 'delay'/);
assert.match(js, /TRIGGER === 'scroll'/);
assert.doesNotMatch(js, /Comparing plans\? I can help you choose Free or Pro/);

{
  const { launcher } = bootWidget({ href: "https://www.whachatcrm.com/", pageRules: [] });
  assert.ok(launcher, "Active widget with no page rules must render launcher");
}

{
  const { launcher, settingsBody } = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.ok(launcher, "homepage must keep launcher when /pricing rule exists");
  assert.equal(
    matchWidgetPageRule({ pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }] }, "https://www.whachatcrm.com/"),
    null,
  );
  const cfg = visitorRuntimeConfigFromPublicSettings(settingsBody, ORIGIN, WIDGET_ID);
  assert.ok(cfg?.launcherCss);
  assert.equal(cfg?.pageRules.length, 1);
}

{
  const { launcher, settingsBody } = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.ok(launcher, "/pricing must still render launcher");
  const matched = matchWidgetPageRule(
    { pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }] },
    "https://www.whachatcrm.com/pricing",
    "en",
  );
  assert.equal(matched?.ruleKey, "pathname:/pricing");
  assert.ok((matched?.greeting || "").includes("Comparing plans"));
  assert.equal(matched?.suggestedQuestions.length, 3);
  const cfg = visitorRuntimeConfigFromPublicSettings(settingsBody, ORIGIN, WIDGET_ID);
  assert.equal(cfg?.pageRules[0]?.matchType, "pathname");
}

{
  const { launcher, created, historyObj } = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.ok(launcher);
  const click = launcher!.listeners.click?.[0];
  assert.ok(click);
  click();
  const findTag = (els: MockEl[], tag: string): MockEl | undefined => {
    for (const el of els) {
      if (el.tag === tag) return el;
      const nested = findTag(el.children || [], tag);
      if (nested) return nested;
    }
  };
  const iframe = findTag(created, "iframe");
  assert.ok(iframe, "initial iframe must be created");
  const initialSrc = String(iframe!.src || iframe!.attrs.src || "");
  assert.match(initialSrc, /\/widget-frame\//);
  const ret = historyObj.pushState({}, "", "/pricing");
  assert.equal((ret as { kind: string }).kind, "push");
  assert.equal(String(iframe!.src || iframe!.attrs.src || ""), initialSrc);
  const ret2 = historyObj.replaceState({}, "", "/");
  assert.equal((ret2 as { kind: string }).kind, "replace");
  assert.equal(String(iframe!.src || iframe!.attrs.src || ""), initialSrc);
}

{
  const shown = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    sessionShown: true,
    localStorageRaw: JSON.stringify(["pathname:/pricing"]),
  });
  assert.ok(shown.launcher);
  const malformed = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    localStorageRaw: "{not-json",
  });
  assert.ok(malformed.launcher);
  assert.deepEqual(readShownPageRuleKeys("{not-json"), []);
  assert.deepEqual(readShownPageRuleKeys("null"), []);
}

{
  const legacy = { urlContains: "/about", greeting: "Hello there", prefilledMessage: "" };
  assert.equal(validateWidgetPageRules([legacy]).ok, true);
  const hit = matchWidgetPageRule({ pageRules: [legacy] }, "https://www.whachatcrm.com/about");
  assert.equal(hit?.matchType, "contains");
  const withPricing = publicBody([{ ...PRICING_PAGE_RULE_FIXTURE }]);
  const rules = visitorSafeWidgetPageRules(withPricing.settings, "he");
  assert.equal(rules[0]?.suggestedQuestions.length, 3);
  assert.doesNotThrow(() => JSON.stringify(withPricing.body));
  assert.doesNotThrow(() => JSON.stringify(publicBody([]).body));
}

{
  const throwing = {
    get urlContains() {
      throw new Error("bad rule");
    },
    matchType: "pathname",
  };
  const settings = { pageRules: [throwing, { ...PRICING_PAGE_RULE_FIXTURE }] };
  assert.equal(matchWidgetPageRule(settings, "https://www.whachatcrm.com/pricing")?.ruleKey, "pathname:/pricing");
  assert.equal(visitorSafeWidgetPageRules(settings, "en").length, 1);
  const { launcher } = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [throwing, { ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.ok(launcher, "invalid sibling rule must not hide launcher");
}

{
  assert.match(js, /try \{ onParentNavigate\(\); \} catch/);
  const writable = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
  });
  assert.ok(writable.launcher);
  const frozen = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    historyWritable: false,
  });
  assert.ok(frozen.launcher, "history hook failure must not abort launcher boot");
}

{
  const listed = publicWidgetEmbedDecision({
    enabled: true,
    allowedOrigins: MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS,
    allowAnyOrigin: false,
  });
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.ok(listed.allowedOrigins.includes("https://www.whachatcrm.com"));
    assert.ok(listed.allowedOrigins.includes("https://whachatcrm.com"));
  }
  const script = readFileSync(join(process.cwd(), "server/webchatPublicScript.ts"), "utf8");
  assert.doesNotMatch(script, /allowAnyOrigin\s*=\s*true/);
}

{
  const desktop = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    mobile: false,
  });
  const mobile = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    mobile: true,
  });
  assert.ok(desktop.launcher);
  assert.ok(mobile.launcher);
  assert.equal(String(desktop.launcher?.style.cssText || "").includes("display:none"), false);
}

const CONTACT_RULE = {
  urlContains: "/contact",
  matchType: "pathname" as const,
  greeting: "Want to talk with the team?",
  teaserGreeting: "Need a hand? Ask us anything.",
};

function teaserBody(el: { lastChild?: { textContent: string } } | undefined) {
  return el?.lastChild?.textContent || "";
}

{
  const longGreeting = PRICING_PAGE_RULE_FIXTURE.greeting;
  assert.ok(fallbackPageRuleTeaserFromGreeting(longGreeting).length <= 140);
  assert.notEqual(fallbackPageRuleTeaserFromGreeting(longGreeting), longGreeting);
  assert.equal(
    resolveLocalizedPageRuleTeaser({ locale: "en", ...PRICING_PAGE_RULE_FIXTURE }),
    PRICING_PAGE_RULE_TEASER.en,
  );
  assert.equal(
    resolveLocalizedPageRuleTeaser({ locale: "es", ...PRICING_PAGE_RULE_FIXTURE }),
    PRICING_PAGE_RULE_TEASER.es,
  );
  assert.equal(
    resolveLocalizedPageRuleTeaser({ locale: "he", ...PRICING_PAGE_RULE_FIXTURE }),
    PRICING_PAGE_RULE_TEASER.he,
  );
  const legacy = resolveLocalizedPageRuleTeaser({
    locale: "en",
    greeting: "Questions about pricing? I can walk you through every plan in detail for several minutes.",
  });
  assert.ok(legacy.startsWith("Questions about pricing?"));
  assert.ok(!legacy.includes("several minutes"));
  assert.equal(
    decidePageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: false,
      deviceAllowed: true,
      ruleKey: "pathname:/pricing",
      teaserText: PRICING_PAGE_RULE_TEASER.en,
      alreadyShownForRule: false,
      cooldownActive: false,
      humanTakeover: true,
      pendingVisitorInput: false,
    }),
    "none",
  );
  assert.equal(pageRuleTeaserCooldownActive(100, 100 + PAGE_RULE_TEASER_COOLDOWN_MS - 1), true);
  assert.equal(pageRuleTeaserCooldownActive(100, 100 + PAGE_RULE_TEASER_COOLDOWN_MS), false);
}

{
  const home = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    timerMode: "queue",
  });
  assert.ok(home.launcher);
  home.flushTimers(1200);
  assert.equal(home.teaser?.style.opacity, "1");
  assert.equal(home.teaser?.attrs["data-wcw-teaser-kind"], "global");
  assert.equal(teaserBody(home.teaser).includes("estimate savings"), false);
  home.historyObj.pushState({}, "", "/pricing");
  assert.equal(home.locationObj.pathname, "/pricing");
  assert.equal(home.teaser?.style.opacity, "0");
  home.flushTimers(1200);
  assert.equal(home.teaser?.style.opacity, "1");
  assert.equal(home.teaser?.attrs["data-wcw-teaser-kind"], "page");
  assert.equal(teaserBody(home.teaser), PRICING_PAGE_RULE_TEASER.en);
  assert.ok(home.launcher);
}

{
  const direct = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    timerMode: "queue",
  });
  direct.flushTimers(1200);
  assert.equal(direct.teaser?.attrs["data-wcw-teaser-kind"], "page");
  assert.equal(teaserBody(direct.teaser), PRICING_PAGE_RULE_TEASER.en);
  assert.notEqual(teaserBody(direct.teaser), PRICING_PAGE_RULE_FIXTURE.greeting);
  const click = direct.teaser?.listeners.click?.[0];
  assert.ok(click);
  click();
  const findTag = (els: MockEl[], tag: string): MockEl | undefined => {
    for (const el of els) {
      if (el.tag === tag) return el;
      const nested = findTag(el.children || [], tag);
      if (nested) return nested;
    }
  };
  const iframe = findTag(direct.created, "iframe");
  assert.ok(iframe);
  const src = String(iframe!.src || iframe!.attrs.src || "");
  assert.match(src, /greeting=/);
  assert.ok(decodeURIComponent(src).includes("estimate savings"));
  assert.equal(direct.launcher?.style.opacity === "0", false);
}

{
  const pending = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    timerMode: "queue",
  });
  pending.historyObj.pushState({}, "", "/");
  pending.flushTimers(1200);
  assert.notEqual(pending.teaser?.attrs["data-wcw-teaser-kind"], "page");
  assert.ok(!String(pending.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
}

{
  const again = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    timerMode: "queue",
    pageTeaserShown: ["pathname:/pricing"],
  });
  again.flushTimers(1200);
  assert.notEqual(again.teaser?.style.opacity, "1");
  assert.ok(again.launcher);
}

{
  const rules = [{ ...PRICING_PAGE_RULE_FIXTURE }, CONTACT_RULE];
  const rapid = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: rules,
    timerMode: "queue",
  });
  rapid.flushTimers(1200);
  assert.equal(rapid.teaser?.attrs["data-wcw-teaser-kind"], "page");
  rapid.historyObj.pushState({}, "", "/contact");
  rapid.flushTimers(1200);
  assert.notEqual(teaserBody(rapid.teaser), CONTACT_RULE.teaserGreeting);
  rapid.advanceClock(PAGE_RULE_TEASER_COOLDOWN_MS + 1);
  rapid.historyObj.pushState({}, "", "/");
  rapid.historyObj.pushState({}, "", "/contact");
  rapid.flushTimers(1200);
  assert.equal(teaserBody(rapid.teaser), CONTACT_RULE.teaserGreeting);
}

{
  const gated = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }],
    timerMode: "queue",
  });
  gated.dispatchMessage({
    source: "wcw",
    type: "wcw-teaser-gate",
    widgetId: WIDGET_ID,
    blocked: true,
  });
  gated.flushTimers(1200);
  assert.notEqual(gated.teaser?.style.opacity, "1");
  assert.ok(gated.launcher);
}

{
  const es = visitorSafeWidgetPageRules({ pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }] }, "es");
  const he = visitorSafeWidgetPageRules({ pageRules: [{ ...PRICING_PAGE_RULE_FIXTURE }] }, "he");
  assert.equal(es[0]?.teaserGreeting, PRICING_PAGE_RULE_TEASER.es);
  assert.equal(he[0]?.teaserGreeting, PRICING_PAGE_RULE_TEASER.he);
  assert.notEqual(es[0]?.teaserGreeting, es[0]?.greeting);
}

{
  const aliased = { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing", "/he/pricing"] };
  const pending = bootWidget({
    href: "https://www.whachatcrm.com/he/pricing",
    pageRules: [aliased],
    timerMode: "queue",
  });
  assert.ok(pending.launcher, "closed launcher stays up while locale changes");
  const histRet = pending.historyObj.pushState({}, "", "/es/pricing");
  assert.equal((histRet as { kind: string }).kind, "push");
  pending.flushTimers(1200);
  assert.equal(teaserBody(pending.teaser), PRICING_PAGE_RULE_TEASER.es);
  assert.equal(pending.teaser?.attrs.dir, "ltr");

  const visible = bootWidget({
    href: "https://www.whachatcrm.com/he/pricing",
    pageRules: [aliased],
    timerMode: "queue",
  });
  visible.flushTimers(1200);
  assert.equal(teaserBody(visible.teaser), PRICING_PAGE_RULE_TEASER.he);
  assert.equal(visible.teaser?.attrs.dir, "rtl");
  visible.historyObj.pushState({}, "", "/es/pricing");
  assert.equal(teaserBody(visible.teaser), PRICING_PAGE_RULE_TEASER.es);
  assert.equal(visible.teaser?.attrs["data-wcw-teaser-kind"], "page");
  visible.locationObj.href = "https://www.whachatcrm.com/pricing";
  visible.locationObj.pathname = "/pricing";
  visible.firePopState();
  assert.equal(teaserBody(visible.teaser), PRICING_PAGE_RULE_TEASER.en);
  assert.equal(visible.teaser?.attrs.dir, "ltr");

  const consumed = bootWidget({
    href: "https://www.whachatcrm.com/es/pricing",
    pageRules: [aliased],
    pageTeaserShown: ["pathname:/pricing"],
    timerMode: "queue",
  });
  consumed.flushTimers(1200);
  consumed.historyObj.pushState({}, "", "/he/pricing");
  consumed.flushTimers(1200);
  assert.notEqual(consumed.teaser?.style.opacity, "1");

  const queryOnly = bootWidget({
    href: "https://www.whachatcrm.com/he/pricing",
    pageRules: [aliased],
    timerMode: "queue",
  });
  queryOnly.historyObj.pushState({}, "", "/he/pricing?utm=1");
  queryOnly.flushTimers(1200);
  assert.equal(teaserBody(queryOnly.teaser), PRICING_PAGE_RULE_TEASER.he);

  const opened = bootWidget({
    href: "https://www.whachatcrm.com/he/pricing",
    pageRules: [aliased],
  });
  opened.launcher!.listeners.click?.[0]?.();
  const findTag = (els: typeof opened.created, tag: string): (typeof opened.created)[0] | undefined => {
    for (const el of els) {
      if (el.tag === tag) return el;
      const nested = findTag(el.children || [], tag);
      if (nested) return nested;
    }
  };
  const iframe = findTag(opened.created, "iframe");
  const initialSrc = String(iframe?.src || iframe?.attrs.src || "");
  opened.historyObj.pushState({}, "", "/es/pricing");
  opened.historyObj.replaceState({}, "", "/pricing");
  assert.equal(String(iframe?.src || iframe?.attrs.src || ""), initialSrc);
}

const HOME_AND_PRICING = [
  { ...HOMEPAGE_PAGE_RULE_FIXTURE },
  { ...PRICING_PAGE_RULE_FIXTURE, urlAliases: ["/es/pricing", "/he/pricing"] },
];

{
  assert.equal(
    explainPageRuleTeaser({
      openBehavior: "teaser",
      chatOpen: true,
      deviceAllowed: true,
      ruleKey: "pathname:/pricing",
      teaserText: PRICING_PAGE_RULE_TEASER.en,
      alreadyShownForRule: false,
      cooldownActive: false,
      humanTakeover: false,
      pendingVisitorInput: false,
    }).reason,
    "chat_open",
  );
  assert.equal(remainingPageRuleTeaserCooldownMs(100, 100 + 500), PAGE_RULE_TEASER_COOLDOWN_MS - 500);
}

{
  const containsHome = {
    urlContains: "/",
    matchType: "contains" as const,
    teaserGreeting: HOMEPAGE_PAGE_RULE_FIXTURE.teaserGreeting,
    greeting: HOMEPAGE_PAGE_RULE_FIXTURE.greeting,
  };
  const hit = matchWidgetPageRule(
    { pageRules: [containsHome, HOME_AND_PRICING[1]] },
    "https://www.whachatcrm.com/pricing",
    "en",
  );
  assert.equal(hit?.ruleKey, "pathname:/pricing");
}

{
  for (const [href, expected] of [
    ["https://www.whachatcrm.com/pricing", PRICING_PAGE_RULE_TEASER.en],
    ["https://www.whachatcrm.com/es/pricing", PRICING_PAGE_RULE_TEASER.es],
    ["https://www.whachatcrm.com/he/pricing", PRICING_PAGE_RULE_TEASER.he],
  ] as const) {
    const boot = bootWidget({ href, pageRules: HOME_AND_PRICING, timerMode: "queue" });
    boot.flushTimers(1200);
    assert.equal(boot.teaser?.style.opacity, "1", href);
    assert.equal(boot.teaser?.attrs["data-wcw-teaser-kind"], "page");
    assert.equal(teaserBody(boot.teaser), expected);
    assert.equal(boot.teaser?.attrs["data-wcw-teaser-reason"], "rendered");
    assert.ok(String(boot.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
  }
}

{
  const mobile = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
    mobile: true,
  });
  mobile.flushTimers(1200);
  assert.equal(mobile.teaser?.attrs["data-wcw-teaser-kind"], "page");
  assert.equal(teaserBody(mobile.teaser), PRICING_PAGE_RULE_TEASER.en);
}

{
  const pending = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
  });
  pending.historyObj.pushState({}, "", "/contact");
  assert.ok(!String(pending.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
  pending.historyObj.pushState({}, "", "/pricing");
  pending.flushTimers(1200);
  assert.equal(pending.teaser?.style.opacity, "1");
  assert.equal(teaserBody(pending.teaser), PRICING_PAGE_RULE_TEASER.en);
}

{
  const titleNav = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
  });
  (titleNav.ctx.document as { title: string }).title = "Pricing | WhachatCRM";
  titleNav.historyObj.replaceState({}, "", "/pricing");
  titleNav.flushTimers(1200);
  assert.equal(titleNav.teaser?.style.opacity, "1");
  assert.equal(titleNav.teaser?.attrs["data-wcw-teaser-kind"], "page");
}

{
  const cooled = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
    pageTeaserAt: 1_700_000_000_000,
    clock: 1_700_000_000_000,
  });
  cooled.flushTimers(1200);
  assert.notEqual(cooled.teaser?.style.opacity, "1");
  assert.equal(cooled.teaser?.attrs["data-wcw-teaser-reason"], "cooldown");
  assert.ok(!String(cooled.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
  cooled.advanceClock(PAGE_RULE_TEASER_COOLDOWN_MS + 30);
  cooled.flushTimers(PAGE_RULE_TEASER_COOLDOWN_MS + 50);
  assert.equal(cooled.teaser?.style.opacity, "1");
  assert.equal(teaserBody(cooled.teaser), PRICING_PAGE_RULE_TEASER.en);
}

{
  const malformed = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
    pageTeaserRaw: "{not-json",
  });
  malformed.flushTimers(1200);
  assert.equal(malformed.teaser?.style.opacity, "1");
}

{
  const homeFirst = bootWidget({
    href: "https://www.whachatcrm.com/",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
  });
  homeFirst.flushTimers(1200);
  assert.equal(teaserBody(homeFirst.teaser), HOMEPAGE_PAGE_RULE_FIXTURE.teaserGreeting);
  assert.ok(!String(homeFirst.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
}

{
  const containsHome = {
    urlContains: "/",
    matchType: "contains" as const,
    teaserGreeting: HOMEPAGE_PAGE_RULE_FIXTURE.teaserGreeting,
    greeting: HOMEPAGE_PAGE_RULE_FIXTURE.greeting,
  };
  const firstLoad = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: [containsHome, HOME_AND_PRICING[1]],
    timerMode: "queue",
    deferReveal: true,
  });
  firstLoad.flushTimers(1);
  (firstLoad.ctx.document as { title: string }).title = "Pricing | WhachatCRM";
  firstLoad.historyObj.replaceState({}, "", "/pricing");
  const findCreated = (testId: string, attr = "data-testid") =>
    firstLoad.created.find((el) => el.attrs[attr] === testId);
  assert.equal(findCreated("wcw-launcher"), undefined);
  firstLoad.flushTimers(1);
  firstLoad.flushTimers(1200);
  const firstTeaser = findCreated("teaser", "data-wcw");
  assert.ok(findCreated("wcw-launcher"));
  assert.equal(firstTeaser?.style.opacity, "1");
  assert.equal(teaserBody(firstTeaser), PRICING_PAGE_RULE_TEASER.en);
  assert.equal(firstTeaser?.attrs["data-wcw-teaser-reason"], "rendered");
}

{
  const failed = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
  });
  const style = failed.teaser?.style as { opacity?: string };
  Object.defineProperty(style, "opacity", {
    configurable: true,
    get: () => "0",
    set: () => undefined,
  });
  failed.flushTimers(1200);
  assert.notEqual(failed.teaser?.style.opacity, "1");
  assert.equal(failed.teaser?.attrs["data-wcw-teaser-reason"], "render_failed");
  assert.ok(!String(failed.store[`wcw-pr-teaser:${WIDGET_ID}`] || "").includes("pathname:/pricing"));
}

{
  const takeover = bootWidget({
    href: "https://www.whachatcrm.com/pricing",
    pageRules: HOME_AND_PRICING,
    timerMode: "queue",
  });
  takeover.dispatchMessage({
    source: "wcw",
    type: "wcw-teaser-gate",
    widgetId: WIDGET_ID,
    blocked: true,
    reason: "takeover",
  });
  takeover.flushTimers(1200);
  assert.notEqual(takeover.teaser?.style.opacity, "1");
  assert.equal(takeover.teaser?.attrs["data-wcw-teaser-reason"], "takeover");
  assert.ok(takeover.launcher);
}

console.log("webchat-launcher-boot-repro: ok");
