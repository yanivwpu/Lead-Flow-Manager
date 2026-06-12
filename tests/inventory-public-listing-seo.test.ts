/**
 * Public listing SEO metadata and sitemap helpers.
 * Run: npx tsx tests/inventory-public-listing-seo.test.ts
 */
import {
  buildListingOpenGraphMeta,
  buildListingSeoMeta,
  buildListingStructuredDataJson,
  buildPublicListingFlyerHtml,
  buildPublicListingLoadErrorHtml,
  buildPublicListingNotFoundHtml,
  inventoryRowToFlyerListing,
  LISTING_OG_IMAGE_HEIGHT,
  LISTING_OG_IMAGE_WIDTH,
  renderListingOpenGraphTags,
} from "../shared/inventory/publicListingFlyer";
import { renderUrlset, sitemapLocForEntry } from "../server/routes/publicListingsSitemap";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "2e059e00-0846-4f23-a606-cf0812b57bff";
const publicSlug = "3503-oaks-way-308-pompano-beach-fl-33069-2e059e00";
const origin = "https://app.whachatcrm.com";
const canonicalUrl = `${origin}/share/listings/${publicSlug}`;

const listing = inventoryRowToFlyerListing({
  id: listingId,
  priceCents: 26500000,
  beds: "2",
  baths: "2",
  squareFeet: 1225,
  yearBuilt: 1981,
  hoaFeeCents: 80500,
  propertyType: "condo",
  propertySubtype: "Condominium",
  description: "Bright corner unit.",
  features: ["Pool"],
  photos: [{ url: "https://cdn.example.com/a.jpg", order: 0 }],
  addressLine1: "3503 Oaks Way",
  addressLine2: "#308",
  city: "Pompano Beach",
  state: "FL",
  zip: "33069",
  latitude: 26.2,
  longitude: -80.1,
  status: "active",
  providerListingId: "A11996737",
  listingDetails: {},
});

const agent = {
  name: "Jane Agent",
  email: "jane@broker.com",
  phone: "+1 954-555-0100",
  avatarUrl: null,
  brokerageName: "Summit Realty",
  bookingLink: null,
};

const seo = buildListingSeoMeta({ listing, agent, shareUrl: canonicalUrl });
assert(seo.title.includes("3503 Oaks Way #308"), "seo title includes street");
assert(seo.title.includes("2 Beds 2 Baths"), "seo title includes beds baths");
assert(seo.title.includes("Pompano Beach, FL Real Estate"), "seo title includes market");
assert(seo.description.includes("View 3503 Oaks Way #308."), "seo description lead");
assert(seo.description.includes("1,225 sq ft"), "seo description sqft");
assert(seo.description.includes("$265,000"), "seo description price");

const og = buildListingOpenGraphMeta({ listing, agent, shareUrl: canonicalUrl });
assert(og.shareUrl === canonicalUrl, "og url canonical");
assert(og.imageUrl === "https://cdn.example.com/a.jpg", "og image");

const jsonLd = buildListingStructuredDataJson({ listing, agent, shareUrl: canonicalUrl });
assert(jsonLd != null, "json-ld generated");
assert(jsonLd!.includes('"@type":["RealEstateListing","Residence"]'), "schema types");
assert(jsonLd!.includes('"price":"265000"'), "schema price");
assert(jsonLd!.includes('"yearBuilt":1981'), "schema year built");

const html = buildPublicListingFlyerHtml({
  listing,
  agent,
  shareUrl: canonicalUrl,
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(html.includes(`<link rel="canonical" href="${canonicalUrl}"`), "canonical tag");
assert(html.includes('property="og:url"'), "og url tag");
assert(html.includes('name="twitter:card" content="summary_large_image"'), "twitter card");
assert(
  html.includes(`property="og:image:width" content="${LISTING_OG_IMAGE_WIDTH}"`),
  "og image width",
);
assert(
  html.includes(`property="og:image:height" content="${LISTING_OG_IMAGE_HEIGHT}"`),
  "og image height",
);
assert(html.includes("application/ld+json"), "json-ld script");
assert(html.includes("3503 Oaks Way #308 | 2 Beds 2 Baths"), "document title");

const ogTags = renderListingOpenGraphTags(og);
assert(ogTags.includes('property="og:image:width"'), "renderListingOpenGraphTags width");
assert(ogTags.includes('property="og:image:height"'), "renderListingOpenGraphTags height");

const notFoundHtml = buildPublicListingNotFoundHtml();
assert(
  notFoundHtml.includes('property="og:title" content="Listing not available | WhachatCRM"'),
  "404 og title",
);
assert(
  notFoundHtml.includes(
    'property="og:description" content="This listing may be unavailable or expired."',
  ),
  "404 og description",
);

const loadErrorHtml = buildPublicListingLoadErrorHtml();
assert(
  loadErrorHtml.includes('property="og:title" content="Listing not available | WhachatCRM"'),
  "500 og title",
);
assert(
  loadErrorHtml.includes(
    'property="og:description" content="This listing may be unavailable or expired."',
  ),
  "500 og description",
);

const urlset = renderUrlset(
  [{ id: listingId, publicSlug, lastmod: new Date("2026-06-01") }],
  origin,
);
assert(urlset.includes(canonicalUrl), "sitemap uses slug url");
assert(urlset.includes("<lastmod>2026-06-01</lastmod>"), "sitemap lastmod");

const uuidFallback = sitemapLocForEntry(
  { id: listingId, publicSlug: null, lastmod: new Date() },
  origin,
);
assert(uuidFallback === `${origin}/share/listings/${listingId}`, "sitemap uuid fallback");

console.log("inventory-public-listing-seo.test.ts: OK");
