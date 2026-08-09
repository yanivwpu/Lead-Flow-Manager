/**
 * Public SiteFooter structure, social profiles, localization, and Organization sameAs.
 * Run: npx tsx tests/site-footer.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getLocalizedSiteFooter,
  getSiteFooterEnglishHrefs,
  SITE_FOOTER_COLUMNS_EN,
} from "../shared/siteFooterContent";
import {
  WHACHAT_ORGANIZATION_SAME_AS,
  WHACHAT_SOCIAL_LINK_REL,
  WHACHAT_SOCIAL_PROFILES,
} from "../shared/whachatSocialProfiles";
import { generateHomepageHtml, PAGE_META } from "../server/seo";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const KNOWN_PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/pricing",
  "/blog",
  "/help",
  "/user-guide",
  "/partner-program",
  "/prospect-ai",
  "/realtor-growth-engine",
  "/real-estate-crm",
  "/shopify-crm",
  "/go-high-level-agencies",
  "/unified-inbox",
  "/shared-team-inbox",
  "/automation-templates",
  "/whatsapp-business-api",
  "/ai-lead-scoring",
  "/best-whatsapp-crm-2026",
  "/wati-alternative",
  "/manychat-alternative",
  "/respond-io-alternative",
  "/zoko-alternative",
  "/pabbly-alternative",
  "/interakt-alternative",
  "/waba360-alternative",
  "/crm-for-whatsapp-business",
  "/contact",
  "/whatsapp-crm",
  "/crm-with-mls-integration",
  "/solutions/ecommerce",
  "/solutions/local-service-businesses",
  "/solutions/marketing-agencies",
  "/solutions/med-spas",
  "/ai-brain",
  "/ai-copilot",
  "/automations",
  "/chatbot-builder",
  "/campaigns",
  "/integrations",
  "/privacy-policy",
  "/terms-of-use",
  "/data-deletion",
  "/unsubscribe",
]);

const EXPECTED_SOCIAL = [
  "https://www.facebook.com/whachatcrm/",
  "https://www.linkedin.com/company/whachatcrm",
  "https://x.com/whachatcrm",
  "https://www.instagram.com/whachatcrm/",
];

const FORBIDDEN_SOLUTION_HREFS = ["/prospect-ai", "/shopify-crm", "/go-high-level-agencies"];

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`not ok - ${name}`);
    throw err;
  }
}

run("verified social profiles are exact HTTPS URLs", () => {
  assert.equal(WHACHAT_SOCIAL_PROFILES.length, 4);
  assert.deepEqual(
    WHACHAT_SOCIAL_PROFILES.map((p) => p.url),
    EXPECTED_SOCIAL,
  );
  assert.deepEqual([...WHACHAT_ORGANIZATION_SAME_AS], EXPECTED_SOCIAL);
  assert.equal(new Set(WHACHAT_ORGANIZATION_SAME_AS).size, EXPECTED_SOCIAL.length);
  for (const url of WHACHAT_ORGANIZATION_SAME_AS) {
    assert.match(url, /^https:\/\//);
  }
  assert.equal(WHACHAT_SOCIAL_LINK_REL, "noopener noreferrer me");
});

run("Organization sameAs in index.html matches shared config", () => {
  const html = readFileSync(join(root, "client/index.html"), "utf8");
  const match = html.match(/"sameAs"\s*:\s*(\[[^\]]+\])/);
  assert.ok(match, "sameAs present in index.html");
  const sameAs = JSON.parse(match![1]) as string[];
  assert.deepEqual(sameAs, EXPECTED_SOCIAL);
  assert.doesNotMatch(html, /twitter\.com\/whachatcrm/);
  assert.doesNotMatch(html, /developers\.facebook\.com\/apps/);
  assert.doesNotMatch(html, /business\.facebook\.com/);
});

run("GoHighLevel agencies Organization uses shared sameAs", () => {
  const src = readFileSync(join(root, "client/src/pages/GoHighLevelAgencies.tsx"), "utf8");
  assert.match(src, /WHACHAT_ORGANIZATION_SAME_AS/);
  assert.doesNotMatch(src, /twitter\.com\/whachatcrm/);
});

run("every footer internal href is a known public route", () => {
  for (const href of getSiteFooterEnglishHrefs()) {
    assert.ok(href.startsWith("/"), href);
    assert.ok(
      KNOWN_PUBLIC_PATHS.has(href) || PAGE_META[href] != null,
      `unknown footer href: ${href}`,
    );
    assert.notEqual(href, "#");
  }
});

run("Product and Solutions columns point to the right architectures", () => {
  const product = SITE_FOOTER_COLUMNS_EN.find((c) => c.id === "product")!;
  const solutions = SITE_FOOTER_COLUMNS_EN.find((c) => c.id === "solutions")!;
  assert.ok(product.links.some((l) => l.href === "/prospect-ai"));
  assert.ok(product.links.some((l) => l.href === "/ai-brain"));
  assert.ok(product.links.some((l) => l.href === "/shared-team-inbox"));
  assert.ok(solutions.links.some((l) => l.href === "/real-estate-crm"));
  assert.ok(solutions.links.some((l) => l.href === "/solutions/ecommerce"));
  for (const link of solutions.links) {
    assert.ok(
      !FORBIDDEN_SOLUTION_HREFS.includes(link.href!),
      `Solutions must not list ${link.href}`,
    );
  }
  const stale = [
    "/shopify-crm",
    "/crm-with-mls-integration",
    "/ai-lead-scoring",
    "/automation-templates",
  ];
  const allHrefs = getSiteFooterEnglishHrefs();
  for (const href of stale) {
    assert.ok(!allHrefs.includes(href), `stale footer href removed: ${href}`);
  }
});

run("Compare and Legal destinations remain valid", () => {
  const compare = SITE_FOOTER_COLUMNS_EN.find((c) => c.id === "compare")!;
  const legal = SITE_FOOTER_COLUMNS_EN.find((c) => c.id === "legal")!;
  assert.ok(compare.links.some((l) => l.href === "/best-whatsapp-crm-2026" && l.id === "more-alternatives"));
  assert.ok(compare.links.some((l) => l.href === "/wati-alternative"));
  assert.ok(legal.links.some((l) => l.href === "/privacy-policy"));
  assert.ok(legal.links.some((l) => l.href === "/terms-of-use"));
  assert.ok(legal.links.some((l) => l.href === "/data-deletion"));
  assert.ok(legal.links.some((l) => l.href === "/unsubscribe"));
  assert.ok(legal.links.some((l) => l.action === "cookiePreferences"));
});

run("Spanish and Hebrew localize Product/Solution/Pricing hrefs", () => {
  const es = getLocalizedSiteFooter("es");
  const he = getLocalizedSiteFooter("he");
  const esBrain = es.columns.flatMap((c) => c.links).find((l) => l.id === "ai-brain");
  const heBrain = he.columns.flatMap((c) => c.links).find((l) => l.id === "ai-brain");
  const esPricing = es.columns.flatMap((c) => c.links).find((l) => l.id === "pricing");
  const hePricing = he.columns.flatMap((c) => c.links).find((l) => l.id === "pricing");
  const esEcommerce = es.columns.flatMap((c) => c.links).find((l) => l.id === "ecommerce");
  const heRealEstate = he.columns.flatMap((c) => c.links).find((l) => l.id === "real-estate");
  assert.equal(esBrain?.href, "/es/ai-brain");
  assert.equal(heBrain?.href, "/he/ai-brain");
  assert.equal(esPricing?.href, "/es/pricing");
  assert.equal(hePricing?.href, "/he/pricing");
  assert.equal(esEcommerce?.href, "/es/solutions/ecommerce");
  assert.equal(heRealEstate?.href, "/he/real-estate-crm");

  const blogEs = es.columns.flatMap((c) => c.links).find((l) => l.id === "blog");
  const helpHe = he.columns.flatMap((c) => c.links).find((l) => l.id === "help");
  const watiEs = es.columns.flatMap((c) => c.links).find((l) => l.id === "wati-alt");
  assert.equal(blogEs?.href, "/blog");
  assert.equal(helpHe?.href, "/help");
  assert.equal(watiEs?.href, "/wati-alternative");
});

run("Spanish and Hebrew footer chrome is translated (no English generics)", () => {
  const es = getLocalizedSiteFooter("es");
  const he = getLocalizedSiteFooter("he");
  assert.equal(es.followUs, "Síguenos");
  assert.equal(he.followUs, "עקבו אחרינו");
  assert.equal(es.columns.find((c) => c.id === "product")?.heading, "Producto");
  assert.equal(he.columns.find((c) => c.id === "product")?.heading, "מוצר");
  assert.equal(es.columns.find((c) => c.id === "compare")?.heading, "Comparar");
  assert.equal(he.columns.find((c) => c.id === "compare")?.heading, "השוואות");
  assert.equal(he.columns.find((c) => c.id === "legal")?.heading, "מידע משפטי");
  assert.match(es.metaTechProvider, /^Meta Tech Provider para WhatsApp Business Platform$/);
  assert.match(he.metaTechProvider, /^Meta Tech Provider עבור WhatsApp Business Platform$/);
  assert.equal(
    es.metaTechProvider.includes("Official") || es.metaTechProvider.includes("Partner"),
    false,
  );
  assert.notEqual(es.tagline, getLocalizedSiteFooter("en").tagline);
  assert.notEqual(he.tagline, getLocalizedSiteFooter("en").tagline);
  assert.equal(es.social[0].url, EXPECTED_SOCIAL[0]);
  assert.equal(he.social[0].url, EXPECTED_SOCIAL[0]);
});

run("homepage SSR footer includes crawlable product/solution/social anchors", () => {
  const en = generateHomepageHtml("en");
  const es = generateHomepageHtml("es");
  const he = generateHomepageHtml("he");
  assert.match(en, /href="\/prospect-ai"/);
  assert.match(en, /href="\/solutions\/ecommerce"/);
  assert.match(en, /href="\/privacy-policy"/);
  assert.match(en, /facebook\.com\/whachatcrm/);
  assert.match(en, /linkedin\.com\/company\/whachatcrm/);
  assert.match(en, /x\.com\/whachatcrm/);
  assert.match(en, /instagram\.com\/whachatcrm/);
  assert.match(en, /rel="noopener noreferrer me"/);
  assert.match(en, /Meta Tech Provider for the WhatsApp Business Platform/);
  assert.match(es, /href="\/es\/ai-brain"/);
  assert.match(es, /href="\/es\/pricing"/);
  assert.match(es, /Síguenos/);
  assert.match(he, /href="\/he\/real-estate-crm"/);
  assert.match(he, /עקבו אחרינו/);
  assert.doesNotMatch(en, /href="\/shopify-crm"/);
  assert.doesNotMatch(en, /twitter\.com\/whachatcrm/);
});

run("SiteFooter component wires shared social config and cookie action", () => {
  const src = readFileSync(join(root, "client/src/components/SiteFooter.tsx"), "utf8");
  assert.match(src, /getLocalizedSiteFooter/);
  assert.match(src, /WHACHAT_SOCIAL_LINK_REL/);
  assert.match(src, /openPreferences/);
  assert.match(src, /cookiePreferences/);
  assert.doesNotMatch(src, /href="#"/);
  assert.doesNotMatch(src, /shopify-crm/);
});

console.log("\nAll site-footer tests passed.");
