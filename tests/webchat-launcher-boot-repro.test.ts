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
import { PRICING_PAGE_RULE_FIXTURE } from "../shared/webchatPageRuleFixtures";
import { matchWidgetPageRule } from "../shared/webchatPageRuleMatch";
import { readShownPageRuleKeys } from "../shared/webchatPageRuleEngagement";
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
};

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
  const storage = {
    getItem(k: string) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k: string, v: string) {
      store[k] = String(v);
    },
  };
  const origPush = function pushState(this: unknown, ...args: unknown[]) {
    return { kind: "push", args };
  };
  const origReplace = function replaceState(this: unknown, ...args: unknown[]) {
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
  const loc = new URL(opts.href);
  const ctx: Record<string, unknown> = {
    Array,
    String,
    Object,
    Boolean,
    Number,
    JSON,
    Math,
    Date,
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
      title: loc.pathname === "/pricing" ? "Pricing" : "Home",
      referrer: "",
      createElement: makeEl,
      getElementsByTagName: (tag: string) => (tag === "script" ? [{ src: scriptSrc }] : []),
      addEventListener() {},
    },
    location: { href: opts.href, pathname: loc.pathname, origin: loc.origin },
    history: historyObj,
    navigator: {
      userAgent: opts.mobile ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" : "Mozilla/5.0",
      language: "en-US",
      maxTouchPoints: opts.mobile ? 5 : 0,
    },
    matchMedia: (q: string) => ({
      matches: String(q).includes("max-width: 767px") ? !!opts.mobile : false,
    }),
    requestIdleCallback: (cb: () => void) => cb(),
    setTimeout: (cb: () => void) => {
      cb();
      return 0;
    },
    clearTimeout() {},
    requestAnimationFrame: (cb: () => void) => cb(),
    addEventListener() {},
    sessionStorage: storage,
    localStorage: storage,
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(js, ctx, { timeout: 3000 });
  const launcher = created.find((el) => el.attrs["data-testid"] === "wcw-launcher");
  return { created, launcher, historyObj, settingsBody, ctx, js };
}

const js = buildWebchatPublicScript({ origin: ORIGIN });
const syntax = syntaxCheck(js);
assert.equal(syntax.ok, true, syntax.error);
assert.equal(/https\?:\/\/\//.test(js), false);
assert.match(js, /indexOf\('https:\/\/'\)/);
assert.match(js, /try \{ hookHistory\(\); \}/);
assert.match(js, /return ret;/);

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

console.log("webchat-launcher-boot-repro: ok");
