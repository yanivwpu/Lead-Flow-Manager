import { publicRealEstateLocale } from "../shared/agent/publicRealEstateLocale";
import assert from "node:assert/strict";
import test from "node:test";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import { publicRealEstateText } from "../shared/agent/publicRealEstateLocale";
import type { AgentPageListingCard, PublicAgentPageRenderInput } from "../shared/agent/agentPageTypes";
import { buildPublicListingFlyerHtml, inventoryRowToFlyerListing } from "../shared/inventory/publicListingFlyer";

const origin = "https://agent.locale.test";
const agentUrl = origin + "/agents/example";
const neighborhoodUrl = agentUrl + "/centro";
const shareUrl = origin + "/share/listings/sample";
const authored = "Texto original של הסוכן — preserve this article.";
const row = inventoryRowToFlyerListing({
  id: "listing-1", providerListingId: "MLS-1", status: "active", priceCents: 45000000, currency: "MXN",
  beds: 3, baths: 2, squareFeet: 1800, yearBuilt: 1998, hoaFeeCents: 25150, propertyType: "house",
  propertySubtype: null, description: authored, features: [], photos: [], addressLine1: "12 רחוב Herzl",
  addressLine2: null, city: "México", state: "CDMX", zip: null, latitude: 19.4, longitude: -99.1,
  listingDetails: {},
});
const card: AgentPageListingCard = {
  id: row.id, shareUrl, imageUrl: null, street: row.addressLine1, fullAddress: "12 רחוב Herzl",
  metaSummary: "3 bed", cityState: "México, CDMX", price: "$450,000", currency: row.currency,
  priceCents: row.priceCents, beds: "3 bed", baths: "2 bath", sqft: "1,800 Sq Ft",
  bedsNum: 3, bathsNum: 2, sqftNum: 1800, propertyType: "house", propertySubtype: null,
  status: "Active", listingLabel: "FOR SALE",
};
const settings: PublicAgentPageRenderInput = {
  userId: "fixture", displayName: "Ana Cohen", bio: authored, marketArea: "México", brokerageName: "Fixture Realty",
  avatarUrl: null, companyLogo: null, socialLinks: {}, publicPhone: "+52 555 123 4567", schedulingUrl: "",
  widgetEnabled: false, preferredLeadCapture: "email", showHomeValueCta: true, agentPageSlug: "example",
  canonicalUrl: agentUrl, agentPageUrl: agentUrl, allowSearchIndexing: true,
  listings: [card], browseTotal: 1, browseHasMore: false, browsePageSize: 24,
};
const neighborhood = { name: "Centro", city: "México", state: "CDMX", slug: "centro", parentUrl: agentUrl, content: authored };
function flyer(language: string) {
  return buildPublicListingFlyerHtml({
    listing: row, publicLanguage: language, agent: {
      name: "Ana Cohen", phone: "+52 555 123 4567", brokerageName: "Fixture Realty", avatarUrl: null, bookingLink: null,
    }, shareUrl, qrDataUrl: "", allowStreetAddress: true, allowSearchIndexing: true, inquiryPath: "/fixture/listing-inquiry",
  });
}

for (const language of ["en", "he", "es"]) {
  test(`public real estate SSR locale and SEO in ${language}`, () => {
    const direction = language === "he" ? "rtl" : "ltr";
    const agent = buildPublicAgentPageHtml({ ...settings, publicLanguage: language });
    const guide = buildPublicAgentPageHtml({ ...settings, publicLanguage: "he", neighborhood: {
      ...neighborhood, publicLanguage: language,
    }, canonicalUrl: neighborhoodUrl, listings: [], browseTotal: 0 });
    for (const [html, canonical] of [[agent, agentUrl], [guide, neighborhoodUrl], [flyer(language), shareUrl]]) {
      assert.ok(html.includes(`<html lang="${language}" dir="${direction}">`));
      assert.ok(html.includes(`rel="canonical" href="${canonical}"`));
      assert.ok(html.includes('content="index, follow"'));
      assert.ok(html.includes(authored));
    }
    assert.ok(agent.includes(publicRealEstateText(language, "For Sale")));
    assert.ok(guide.includes(publicRealEstateText(language, "Contact Agent")));
    assert.ok(flyer(language).includes('"priceCurrency":"MXN"'));
    assert.ok(flyer(language).includes('"price":"450000"'));
    const fee = new Intl.NumberFormat(publicRealEstateLocale(language), { style: "currency", currency: "MXN" }).format(251.5);
    assert.ok(flyer(language).includes(publicRealEstateText(language, "HOA {price}/mo", { price: fee })));
    assert.ok(flyer(language).includes(publicRealEstateText(language, "Print flyer")));
    assert.ok(agent.includes('data-label="FOR SALE"'));
    assert.match(buildPublicAgentPageHtml({ ...settings, publicLanguage: "he", neighborhood }), /<html lang="en" dir="ltr">/);
  });
}

test("public filters and inquiry payloads stay canonical across locales", { timeout: 120_000 }, async (t) => {
  if (process.env.AGENT_PAGE_BROWSER_TEST !== "1") return t.skip("Chromium runs in RGE CI");
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE_PATH, headless: true });
  t.after(() => browser.close());
  for (const language of ["en", "he", "es"]) {
    const page = await browser.newPage({ viewport: { width: language === "en" ? 1300 : 390, height: 850 } });
    const requests: URL[] = [];
    const inquiries: unknown[] = [];
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.href === agentUrl || url.href === shareUrl || url.href === neighborhoodUrl) {
        const html = url.href === shareUrl ? flyer(language) : buildPublicAgentPageHtml({
          ...settings, publicLanguage: language, ...(url.href === neighborhoodUrl
            ? { neighborhood: { ...neighborhood, publicLanguage: language }, canonicalUrl: neighborhoodUrl } : {}),
        });
        return route.fulfill({ contentType: "text/html", body: html });
      }
      if (url.pathname.endsWith("/listings")) {
        requests.push(url);
        return route.fulfill({ json: { listings: [], html: "", total: 0, hasMore: false } });
      }
      if (url.pathname.endsWith("/leads") || url.pathname === "/fixture/listing-inquiry") {
        inquiries.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true } });
      }
      return route.fulfill({ body: "" });
    });
    await page.goto(agentUrl);
    assert.equal(await page.locator("html").getAttribute("dir"), language === "he" ? "rtl" : "ltr");
    await page.locator('[data-filter="rent"]').click();
    await page.waitForFunction(() => document.getElementById("browse-empty")?.hidden === false);
    assert.equal(requests.at(-1)?.searchParams.get("listingType"), "rent");
    await page.locator("#btn-message").click();
    await page.locator("#lead-form [name=name]").fill("Synthetic Buyer");
    await page.locator("#lead-form [name=email]").fill("fixture@example.test");
    await page.locator("#lead-form button[type=submit]").click();
    await page.locator("#modal-backdrop").waitFor({ state: "hidden" });
    assert.deepEqual(inquiries[0], { intent: "message", name: "Synthetic Buyer", email: "fixture@example.test", embed: false });

    await page.goto(neighborhoodUrl);
    await page.getByRole("heading", { name: publicRealEstateText(language, "Discover {name}", { name: "Centro" }) }).waitFor();
    await page.goto(shareUrl);
    await page.getByRole("button", { name: publicRealEstateText(language, "Print flyer") }).waitFor();
    await page.locator("#open-listing-inquiry").click();
    await page.locator("#listing-inquiry [name=name]").fill("Synthetic Buyer");
    await page.locator("#listing-inquiry [name=email]").fill("fixture@example.test");
    await page.locator("#listing-inquiry button[type=submit]").click();
    await page.getByText(publicRealEstateText(language, "Thanks. Your inquiry was sent.")).waitFor();
    assert.deepEqual(inquiries[1], { name: "Synthetic Buyer", email: "fixture@example.test", message: "" });
    await page.close();
  }
});
