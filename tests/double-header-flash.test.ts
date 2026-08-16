/**
 * Leaving the homepage must hide #whachat-static-shell before dropping
 * wcs-homepage-shell-live, so static .wcs-nav and React MarketingHeader
 * never paint together. App/auth routes must not mount public marketing chrome.
 *
 * Run: npx tsx --test tests/double-header-flash.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  generateMarketingPageSsrHtml,
  isNoIndexPath,
  removeStaticShellFromHtml,
} from "../server/seo";
import {
  hideStaticMarketingShell,
  isMarketingHomepagePath,
} from "../client/src/lib/marketingShell";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("homepage paths keep the marketing shell; app/auth do not", () => {
  assert.equal(isMarketingHomepagePath("/"), true);
  assert.equal(isMarketingHomepagePath("/es/"), true);
  assert.equal(isMarketingHomepagePath("/he/"), true);
  assert.equal(isMarketingHomepagePath("/app/inbox"), false);
  assert.equal(isMarketingHomepagePath("/app/settings"), false);
  assert.equal(isMarketingHomepagePath("/auth"), false);
});

test("hideStaticMarketingShell adds hide class before removing homepage-shell-live", () => {
  const helper = read("client/src/lib/marketingShell.ts");
  const addIdx = helper.indexOf('classList.add("wcs-hide-static-marketing")');
  const removeIdx = helper.indexOf('classList.remove("wcs-homepage-shell-live")');
  assert.ok(addIdx > 0 && removeIdx > addIdx);
});

test("hideStaticMarketingShell mutates document classes in hide-first order", () => {
  const classes = new Set<string>(["wcs-homepage-shell-live"]);
  (globalThis as { document?: unknown }).document = {
    documentElement: {
      classList: {
        add: (name: string) => {
          classes.add(name);
        },
        remove: (name: string) => {
          classes.delete(name);
        },
      },
    },
  };
  hideStaticMarketingShell();
  assert.equal(classes.has("wcs-hide-static-marketing"), true);
  assert.equal(classes.has("wcs-homepage-shell-live"), false);
});

test("Welcome unmount hides the static shell instead of only dropping the live class", () => {
  const welcome = read("client/src/pages/Welcome.tsx");
  assert.ok(welcome.includes("hideStaticMarketingShell()"));
  assert.ok(!/return \(\) => \{\s*document\.documentElement\.classList\.remove\("wcs-homepage-shell-live"\)/.test(welcome));
});

test("Router and MarketingRoutes hide the static shell on non-home paths", () => {
  const app = read("client/src/App.tsx");
  assert.ok(app.includes("hideStaticMarketingShell"));
  assert.ok(app.includes("isMarketingHomepagePath"));
  const marketingFn = app.slice(app.indexOf("function MarketingRoutes()"));
  const hideInRender = marketingFn.indexOf("hideStaticMarketingShell()");
  const welcomeReturn = marketingFn.indexOf("return <Welcome />");
  assert.ok(hideInRender > 0 && hideInRender < welcomeReturn);
});

test("production /app HTML is treated as noindex SPA (strips static shell)", () => {
  assert.equal(isNoIndexPath("/app"), true);
  assert.equal(isNoIndexPath("/app/inbox"), true);
  assert.equal(isNoIndexPath("/app/settings"), true);
  assert.equal(isNoIndexPath("/"), false);
  assert.equal(isNoIndexPath("/pricing"), false);
  const staticSrc = read("server/static.ts");
  assert.ok(staticSrc.includes("sendNoIndexSpaShell"));
  assert.ok(staticSrc.includes("removeStaticShellFromHtml"));
});

test("authenticated app layout never mounts MarketingHeader or public marketing nav", () => {
  const layout = read("client/src/pages/AppLayout.tsx");
  const app = read("client/src/App.tsx");
  assert.equal(layout.includes("MarketingHeader"), false);
  assert.equal(layout.includes("wcs-nav"), false);
  const protectedRoute = app.slice(app.indexOf("function ProtectedRoute"));
  const spinnerBlock = protectedRoute.slice(
    protectedRoute.indexOf("isLoading || (user && !sessionAligned)"),
    protectedRoute.indexOf("if (!user)"),
  );
  assert.ok(spinnerBlock.includes("Loader2"));
  assert.equal(spinnerBlock.includes("MarketingHeader"), false);
  assert.equal(spinnerBlock.includes("<Sidebar"), false);
  assert.ok(protectedRoute.includes("return <Component"));
  assert.equal(protectedRoute.includes("MarketingHeader"), false);
});

test("logged-out /auth still has the login form", () => {
  const auth = read("client/src/pages/Auth.tsx");
  assert.ok(auth.includes('data-testid="input-password"'));
  assert.ok(auth.includes("export function AuthPage"));
  const app = read("client/src/App.tsx");
  assert.ok(app.includes('path="/auth"'));
  assert.ok(app.includes("component={AuthPage}"));
});

test("login lands on a single AppLayout chrome (sidebar XOR mobile nav by breakpoint)", () => {
  const layout = read("client/src/pages/AppLayout.tsx");
  const sidebar = read("client/src/components/Sidebar.tsx");
  const mobile = read("client/src/components/MobileNav.tsx");
  assert.ok(layout.includes("<Sidebar"));
  assert.ok(layout.includes("<MobileNav"));
  assert.ok(sidebar.includes("hidden md:flex"));
  assert.ok(mobile.includes("md:hidden"));
  assert.equal(layout.includes("MarketingHeader"), false);
});

test("public marketing SSR body stays intact", () => {
  const html = generateMarketingPageSsrHtml("/pricing") || generateMarketingPageSsrHtml("/unified-inbox");
  assert.ok(html);
  assert.match(html!, /data-ssr-content="true"/);
  const index = read("client/index.html");
  assert.ok(index.includes('id="whachat-static-shell"'));
  const stripped = removeStaticShellFromHtml(index);
  assert.equal(stripped.includes('id="whachat-static-shell"'), false);
  assert.ok(index.includes('id="whachat-static-shell"'));
});
