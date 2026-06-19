/**
 * Public listings sitemap + app-host robots.txt behavior.
 * Run: npx tsx tests/public-listings-sitemap.test.ts
 */
import { MATCHABLE_INVENTORY_STATUSES } from "../shared/inventory/inventoryListingSchema";
import { canResolveIndexedPublicListing } from "../shared/inventory/publicListingPublication";
import {
  SITEMAP_CACHE_CONTROL,
  SITEMAP_URLS_PER_FILE,
  applyPublicListingSeoCacheHeaders,
  appRobotsTxt,
  renderSitemapIndex,
  renderUrlset,
  resolveRootSitemapPlan,
  resolveSitemapShardPage,
  sitemapLocForEntry,
} from "../server/routes/publicListingsSitemap";

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const ORIGIN = "https://app.whachatcrm.com";
const LISTING_ID = "2e059e00-0846-4f23-a606-cf0812b57bff";
const PUBLIC_SLUG = "3503-oaks-way-308-pompano-beach-fl-33069-2e059e00";

const COMPLIANT = {
  mlgCanView: true,
  internetEntireListingDisplay: true,
  internetDisplay: true,
  internetAddressDisplay: true,
  listOfficeName: "Premier Realty",
  listAgentName: "Pat Seller",
  mlsSourceName: "mfrmls",
  mlsListingId: "A1234567",
  provider: "mls_grid" as const,
  extractedAt: "2026-01-01T00:00:00.000Z",
};

function testCacheControlHeader() {
  assert(
    SITEMAP_CACHE_CONTROL === "public, max-age=300, stale-while-revalidate=300",
    "cache control constant",
  );
  const headers: Record<string, string> = {};
  applyPublicListingSeoCacheHeaders({
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  } as Parameters<typeof applyPublicListingSeoCacheHeaders>[0]);
  assert(headers["Cache-Control"] === SITEMAP_CACHE_CONTROL, "applyPublicListingSeoCacheHeaders");
  console.log("  cache control: OK");
}

function testRobotsTxtSitemapLine() {
  const withListings = appRobotsTxt(ORIGIN, true);
  assert(withListings.includes(`Sitemap: ${ORIGIN}/public-listings-sitemap.xml`), "robots includes sitemap when listings exist");
  assert(withListings.includes("Allow: /share/"), "robots allows share paths");

  const withoutListings = appRobotsTxt(ORIGIN, false);
  assert(!withoutListings.includes("Sitemap:"), "robots omits sitemap when no published listings");
  console.log("  robots.txt sitemap line: OK");
}

function testRootSitemapPlan() {
  assert(resolveRootSitemapPlan(0).kind === "empty", "empty plan at zero");
  assert(resolveRootSitemapPlan(1).kind === "urlset", "urlset under shard limit");
  assert(resolveRootSitemapPlan(SITEMAP_URLS_PER_FILE).kind === "urlset", "urlset at shard limit");
  assert(resolveRootSitemapPlan(SITEMAP_URLS_PER_FILE + 1).kind === "index", "index over shard limit");
  console.log("  root sitemap plan: OK");
}

function testRootSitemapBodyShape() {
  const urlset = renderUrlset(
    [{ id: LISTING_ID, publicSlug: PUBLIC_SLUG, lastmod: new Date("2026-06-01") }],
    ORIGIN,
  );
  assert(urlset.includes("<urlset"), "root urlset document");
  assert(!urlset.includes("<sitemapindex"), "urlset is not an index");

  const index = renderSitemapIndex(ORIGIN, 2);
  assert(index.includes("<sitemapindex"), "root index document");
  assert(index.includes(`${ORIGIN}/public-listings-sitemap-1.xml`), "index references page 1");
  assert(index.includes(`${ORIGIN}/public-listings-sitemap-2.xml`), "index references page 2");
  assert(!index.includes("<urlset"), "index is not a urlset");
  console.log("  root sitemap body shape: OK");
}

function testShardPagination() {
  const total = SITEMAP_URLS_PER_FILE + 250;
  const page1 = resolveSitemapShardPage(total, 1);
  assert(page1.ok && page1.offset === 0 && page1.limit === SITEMAP_URLS_PER_FILE, "shard page 1");

  const page2 = resolveSitemapShardPage(total, 2);
  assert(page2.ok && page2.offset === SITEMAP_URLS_PER_FILE && page2.limit === 250, "shard page 2 tail");

  assert(!resolveSitemapShardPage(total, 0).ok, "page 0 invalid");
  assert(!resolveSitemapShardPage(total, 3).ok, "page beyond count invalid");
  assert(!resolveSitemapShardPage(total, Number.NaN).ok, "NaN page invalid");
  console.log("  shard pagination: OK");
}

function testSitemapLocSlugPreference() {
  const slugUrl = sitemapLocForEntry(
    { id: LISTING_ID, publicSlug: PUBLIC_SLUG, lastmod: new Date() },
    ORIGIN,
  );
  assert(slugUrl === `${ORIGIN}/share/listings/${PUBLIC_SLUG}`, "sitemap uses public_slug when present");

  const uuidUrl = sitemapLocForEntry(
    { id: LISTING_ID, publicSlug: null, lastmod: new Date() },
    ORIGIN,
  );
  assert(uuidUrl === `${ORIGIN}/share/listings/${LISTING_ID}`, "sitemap uuid fallback when slug missing");
  console.log("  sitemap loc slug preference: OK");
}

function testIndexedListingExclusions() {
  const published = {
    workspacePublishListingsPublicly: true,
    listingPublishPublicly: true,
    status: "active" as const,
    listingCompliance: COMPLIANT,
  };
  assert(canResolveIndexedPublicListing(published), "published active listing included");

  assert(
    !canResolveIndexedPublicListing({ ...published, listingPublishPublicly: false }),
    "unpublished listing excluded from sitemap",
  );
  assert(
    !canResolveIndexedPublicListing({ ...published, workspacePublishListingsPublicly: false }),
    "workspace publish off excluded from sitemap",
  );
  assert(
    !canResolveIndexedPublicListing({ ...published, status: "sold" }),
    "sold listing excluded from sitemap",
  );
  assert(
    !canResolveIndexedPublicListing({ ...published, status: "off_market" }),
    "off_market listing excluded from sitemap",
  );
  assert(
    !canResolveIndexedPublicListing({ ...published, status: "pending" }),
    "pending listing excluded from sitemap",
  );
  assert(!(MATCHABLE_INVENTORY_STATUSES as readonly string[]).includes("sold"), "sold not matchable status");
  assert(!(MATCHABLE_INVENTORY_STATUSES as readonly string[]).includes("off_market"), "off_market not matchable status");
  console.log("  indexed listing exclusions: OK");
}

function main() {
  console.log("public-listings-sitemap tests");
  testCacheControlHeader();
  testRobotsTxtSitemapLine();
  testRootSitemapPlan();
  testRootSitemapBodyShape();
  testShardPagination();
  testSitemapLocSlugPreference();
  testIndexedListingExclusions();
  console.log("\nAll tests passed.");
}

main();
