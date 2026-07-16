/**
 * SPA vs hard-404 routing helpers.
 * Run: npx tsx tests/spa-routing.test.ts
 */
import {
  isInvalidPublicPath,
  normalizeRequestPath,
  shouldServeSpaFallback,
} from "../server/spaRouting";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const marketing = [
  "/pricing",
  "/wati-alternative",
  "/best-whatsapp-crm-2026",
  "/help",
];

assert(normalizeRequestPath("/this-page/") === "/this-page", "strip trailing slash");
assert(normalizeRequestPath("/%EF%BF%BD") === "/\uFFFD", "decode replacement char");
assert(isInvalidPublicPath("/%EF%BF%BD") === true, "FFFD path invalid");
assert(isInvalidPublicPath("/this-page-definitely-does-not-exist") === false, "normal unknown not invalid charset");

assert(shouldServeSpaFallback("/pricing", marketing) === true, "marketing 200");
assert(shouldServeSpaFallback("/app/inbox", marketing) === true, "app spa");
assert(shouldServeSpaFallback("/auth", marketing) === true, "auth spa");
assert(shouldServeSpaFallback("/shopify/install", marketing) === true, "shopify spa");
assert(shouldServeSpaFallback("/widget-frame/abc", marketing) === true, "widget spa");
assert(shouldServeSpaFallback("/share/listings/abc", marketing) === true, "share spa");
assert(shouldServeSpaFallback("/blog/some-post", marketing) === true, "blog spa");

assert(
  shouldServeSpaFallback("/this-page-definitely-does-not-exist", marketing) === false,
  "unknown marketing → 404",
);
assert(shouldServeSpaFallback("/%EF%BF%BD", marketing) === false, "FFFD → 404");
assert(shouldServeSpaFallback("/wati-alternative", marketing) === true, "comparison page spa");

console.log("spa-routing.test.ts: all assertions passed");
