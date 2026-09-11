/**
 * Official Website Chat widget loads once on public marketing pages only.
 * Run: npx tsx --test tests/marketing-website-chat-widget.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { isWidgetPublicId } from "../shared/opaquePublicToken";
import { buildWebchatScriptSnippet } from "../shared/webchatWidgetSnippet";
import {
  MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS,
  MARKETING_WEBSITE_CHAT_HOSTS,
  MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS,
  MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL,
  MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID,
  MARKETING_WEBSITE_CHAT_WIDGET_SNIPPET,
  assertMarketingWebsiteChatWidgetConfig,
  countMarketingWebsiteChatWidgetScripts,
  injectOfficialMarketingWebsiteChatWidget,
  isExcludedMarketingWebsiteChatPath,
  marketingWebsiteChatWidgetScriptSrc,
  shouldLoadMarketingWebsiteChatWidget,
  syncMarketingWebsiteChatWidget,
  type MarketingChatWidgetDom,
  type MarketingChatWidgetWindow,
} from "../shared/marketingWebsiteChatWidget";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const EXACT_SNIPPET = `<!-- WhachatCRM Chat Widget -->
<script>
  (function(w,d,o,f){
    w['WhachatWidget']=o;
    var js=d.createElement('script');
    js.src=f+'?id=wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188';
    js.async=true;
    js.setAttribute('fetchpriority','low');
    d.head.appendChild(js);
  }(window,document,'wcw','https://app.whachatcrm.com/widget.js'));
</script>`;

type ScriptStub = {
  src: string;
  async: boolean;
  attrs: Record<string, string>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
};

function makeDom(): {
  win: MarketingChatWidgetWindow;
  doc: MarketingChatWidgetDom;
  scripts: ScriptStub[];
  classes: Set<string>;
} {
  const scripts: ScriptStub[] = [];
  const classes = new Set<string>();
  const win: MarketingChatWidgetWindow = {};
  const doc: MarketingChatWidgetDom = {
    documentElement: {
      className: "",
      classList: {
        add: (name: string) => {
          classes.add(name);
        },
        remove: (name: string) => {
          classes.delete(name);
        },
      },
    },
    head: {
      appendChild: (node: ScriptStub) => {
        scripts.push(node);
      },
    },
    querySelectorAll: (selector: string) => (selector === "script" ? scripts : []),
    createElement: () => {
      const el: ScriptStub = {
        src: "",
        async: false,
        attrs: {},
        setAttribute: (name: string, value: string) => {
          el.attrs[name] = value;
        },
        getAttribute: (name: string) => {
          if (name === "src") return el.src || null;
          return el.attrs[name] ?? null;
        },
      };
      return el;
    },
  };
  return { win, doc, scripts, classes };
}

test("configured public widget id and allowed origins match Website Widget settings", () => {
  assert.equal(isWidgetPublicId(MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID), true);
  assert.equal(
    MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID,
    "wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188",
  );
  assert.equal(MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL, "https://app.whachatcrm.com");
  assert.deepEqual([...MARKETING_WEBSITE_CHAT_HOSTS].sort(), ["whachatcrm.com", "www.whachatcrm.com"]);
  assert.deepEqual(
    [...MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS].sort(),
    ["https://whachatcrm.com", "https://www.whachatcrm.com"],
  );
  assert.equal(
    MARKETING_WEBSITE_CHAT_ALLOWED_ORIGINS.includes("https://app.whachatcrm.com"),
    false,
  );
  assert.equal(MARKETING_WEBSITE_CHAT_WIDGET_SNIPPET, EXACT_SNIPPET);
  assert.equal(
    buildWebchatScriptSnippet({
      baseUrl: MARKETING_WEBSITE_CHAT_WIDGET_BASE_URL,
      widgetPublicId: MARKETING_WEBSITE_CHAT_WIDGET_PUBLIC_ID,
    }),
    EXACT_SNIPPET,
  );
  assert.doesNotThrow(() => assertMarketingWebsiteChatWidgetConfig());
});

test("one official script on marketing pages; none on excluded app/portal/widget routes", () => {
  const marketingPages = [
    { hostname: "www.whachatcrm.com", pathname: "/" },
    { hostname: "whachatcrm.com", pathname: "/" },
    { hostname: "www.whachatcrm.com", pathname: "/pricing" },
    { hostname: "www.whachatcrm.com", pathname: "/es/" },
    { hostname: "www.whachatcrm.com", pathname: "/he/ai-brain" },
    { hostname: "www.whachatcrm.com", pathname: "/contact" },
    { hostname: "www.whachatcrm.com", pathname: "/blog" },
    { hostname: "www.whachatcrm.com", pathname: "/partner-program" },
    { hostname: "www.whachatcrm.com", pathname: "/auth" },
  ];
  const excluded = [
    { hostname: "www.whachatcrm.com", pathname: "/app" },
    { hostname: "www.whachatcrm.com", pathname: "/app/inbox" },
    { hostname: "www.whachatcrm.com", pathname: "/app/widget" },
    { hostname: "www.whachatcrm.com", pathname: "/sales-admin" },
    { hostname: "www.whachatcrm.com", pathname: "/sales-portal" },
    { hostname: "www.whachatcrm.com", pathname: "/sales-portal/forgot-password" },
    { hostname: "www.whachatcrm.com", pathname: "/partner-portal" },
    { hostname: "www.whachatcrm.com", pathname: "/partner-portal/reset-password" },
    { hostname: "www.whachatcrm.com", pathname: "/widget-frame/wgt_abc" },
    { hostname: "www.whachatcrm.com", pathname: "/chat/wgt_abc" },
    { hostname: "www.whachatcrm.com", pathname: "/shopify/install" },
    { hostname: "app.whachatcrm.com", pathname: "/" },
    { hostname: "app.whachatcrm.com", pathname: "/app/inbox" },
    { hostname: "localhost", pathname: "/" },
    {
      hostname: "www.whachatcrm.com",
      pathname: "/pricing",
      search: "?embedded=1",
    },
    {
      hostname: "www.whachatcrm.com",
      pathname: "/",
      search: "?shop=acme.myshopify.com&shopify_installed=1",
    },
    {
      hostname: "www.whachatcrm.com",
      pathname: "/",
      htmlClassName: "wcs-shopify-preboot wcs-shopify-bootstrap",
    },
  ];

  for (const loc of marketingPages) {
    assert.equal(shouldLoadMarketingWebsiteChatWidget(loc), true, `should load ${loc.hostname}${loc.pathname}`);
    const { win, doc, scripts } = makeDom();
    const result = syncMarketingWebsiteChatWidget(loc, win, doc);
    assert.equal(result, "injected");
    assert.equal(countMarketingWebsiteChatWidgetScripts(doc), 1);
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0]!.src, marketingWebsiteChatWidgetScriptSrc());
    assert.equal(scripts[0]!.async, true);
    assert.equal(scripts[0]!.attrs.fetchpriority, "low");
    assert.equal(win.WhachatWidget, "wcw");
  }

  for (const loc of excluded) {
    assert.equal(
      shouldLoadMarketingWebsiteChatWidget(loc),
      false,
      `should not load ${loc.hostname}${loc.pathname}${loc.search || ""}`,
    );
    const { win, doc, scripts } = makeDom();
    const result = syncMarketingWebsiteChatWidget(loc, win, doc);
    assert.equal(result, "suppressed");
    assert.equal(scripts.length, 0);
    assert.equal(countMarketingWebsiteChatWidgetScripts(doc), 0);
    assert.equal(win.WhachatWidget, undefined);
  }

  assert.equal(isExcludedMarketingWebsiteChatPath("/app/inbox"), true);
  assert.equal(isExcludedMarketingWebsiteChatPath("/partner-program"), false);
});

test("SPA navigation and React remounts do not duplicate the official script", () => {
  const { win, doc, scripts, classes } = makeDom();
  const home = { hostname: "www.whachatcrm.com", pathname: "/" };
  assert.equal(syncMarketingWebsiteChatWidget(home, win, doc), "injected");
  assert.equal(syncMarketingWebsiteChatWidget({ hostname: "www.whachatcrm.com", pathname: "/pricing" }, win, doc), "present");
  assert.equal(injectOfficialMarketingWebsiteChatWidget(win, doc), false);
  assert.equal(scripts.length, 1);
  assert.equal(countMarketingWebsiteChatWidgetScripts(doc), 1);

  assert.equal(
    syncMarketingWebsiteChatWidget({ hostname: "www.whachatcrm.com", pathname: "/app/inbox" }, win, doc),
    "suppressed",
  );
  assert.equal(scripts.length, 1);
  assert.equal(classes.has(MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS), true);

  assert.equal(syncMarketingWebsiteChatWidget(home, win, doc), "present");
  assert.equal(scripts.length, 1);
  assert.equal(classes.has(MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS), false);
});

test("installer is wired globally on marketing routes without a custom chat UI or index.html copy", () => {
  const app = read("client/src/App.tsx");
  assert.match(app, /MarketingWebsiteChatWidget/);
  assert.match(app, /<MarketingWebsiteChatWidget \/>/);
  assert.match(app, /<GoogleAnalyticsRouteTracker \/>/);

  const component = read("client/src/components/MarketingWebsiteChatWidget.tsx");
  assert.match(component, /syncMarketingWebsiteChatWidget/);
  assert.doesNotMatch(component, /buildWebchatIframeSnippet/);
  assert.doesNotMatch(component, /iframe/);

  const helper = read("shared/marketingWebsiteChatWidget.ts");
  assert.match(helper, /buildWebchatScriptSnippet/);
  assert.doesNotMatch(helper, /buildWebchatIframeSnippet/);
  assert.doesNotMatch(helper, /createElement\("iframe"\)/);

  const indexHtml = read("client/index.html");
  assert.doesNotMatch(indexHtml, /widget\.js\?id=/);
  assert.doesNotMatch(indexHtml, /wgt_3c14a2d2a3f30565406e0a2a395c7dcc0903e0f4fba9d188/);

  const css = read("client/src/index.css");
  assert.match(css, new RegExp(MARKETING_WEBSITE_CHAT_SUPPRESS_CLASS));
});
