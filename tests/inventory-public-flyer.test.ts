/**
 * Public listing flyer HTML builder.
 * Run: npx tsx tests/inventory-public-flyer.test.ts
 */
import {
  buildListingOpenGraphMeta,
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
  renderListingOpenGraphTags,
} from "../shared/inventory/publicListingFlyer";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listing = inventoryRowToFlyerListing({
  id: "11111111-1111-1111-1111-111111111111",
  priceCents: 45000000,
  beds: "3",
  baths: "2",
  squareFeet: 1800,
  yearBuilt: 1998,
  hoaFeeCents: 25000,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  description: "Bright corner unit with skyline views.",
  features: ["Hardwood floors", "In-unit laundry"],
  photos: [
    { url: "https://cdn.example.com/a.jpg", order: 0 },
    { url: "https://cdn.example.com/b.jpg", order: 1 },
  ],
  addressLine1: "123 Main St",
  addressLine2: null,
  city: "Austin",
  state: "TX",
  zip: "78701",
  latitude: 30.2672,
  longitude: -97.7431,
  status: "active",
  providerListingId: "MLS-12345",
  listingDetails: { pool: true, waterfront: false, view: "City", parkingGarage: "Garage (2)" },
});

const html = buildPublicListingFlyerHtml({
  listing,
  agent: {
    name: "Jane Agent",
    email: "jane@broker.com",
    phone: "+1 512-555-0100",
    avatarUrl: "https://cdn.example.com/jane.jpg",
    brokerageName: "Summit Realty",
    bookingLink: null,
  },
  shareUrl: "https://app.whachatcrm.com/share/listings/11111111-1111-1111-1111-111111111111",
  qrDataUrl: "data:image/png;base64,TEST",
});

assert(html.includes("123 Main St"), "address in page");
assert(html.includes("$450,000"), "formatted price");
assert(html.includes("1,800 sq ft"), "square footage");
assert(html.includes("Built 1998"), "year built");
assert(html.includes("MLS-12345"), "MLS id");
assert(html.includes("hero-img"), "gallery hero");
assert(html.includes("class=\"thumb"), "thumbnail gallery");
assert(html.includes("Jane Agent"), "agent name");
assert(html.includes("Summit Realty"), "brokerage");
assert(html.includes("Contact agent"), "agent CTA without booking link");
assert(html.includes("Powered by WhachatCRM"), "powered-by footer");
assert(html.includes('href="https://whachatcrm.com"'), "powered-by link");
assert(html.includes("/favicon.svg"), "brand logo in footer");

const bookingHtml = buildPublicListingFlyerHtml({
  listing,
  agent: {
    name: "Jane Agent",
    email: "jane@broker.com",
    phone: "+1 512-555-0100",
    avatarUrl: null,
    brokerageName: "Summit Realty",
    bookingLink: "https://calendly.com/jane/showing",
  },
  shareUrl: "https://app.whachatcrm.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(bookingHtml.includes("Book a showing"), "primary booking CTA");
assert(bookingHtml.includes("https://calendly.com/jane/showing"), "booking URL");
assert(bookingHtml.includes("Contact agent"), "secondary contact CTA with booking");
assert(html.includes("Print Flyer"), "print action");
assert(html.includes("Share Listing"), "share action");
assert(html.includes("Scan to view live listing"), "QR label");
assert(html.includes("openstreetmap.org"), "map embed when lat/lng present");
assert(html.includes("Hardwood floors"), "features list");
assert(html.includes("@media print"), "print styles");
assert(html.includes('property="og:title"'), "open graph title tag");
assert(html.includes('property="og:image"'), "open graph image tag");
assert(html.includes("https://cdn.example.com/a.jpg"), "primary photo in og:image");
assert(html.includes("3 bed / 2 bath"), "beds/baths in og:description");
assert(html.includes("Listed by Jane Agent"), "agent in og:description");
assert(html.includes("$450,000"), "price in og:title");
assert(html.includes('name="twitter:card" content="summary_large_image"'), "twitter large image card");

const ogMeta = buildListingOpenGraphMeta({
  listing,
  agent: {
    name: "Jane Agent",
    email: "jane@broker.com",
    phone: null,
    avatarUrl: null,
    brokerageName: null,
    bookingLink: null,
  },
  shareUrl: "https://app.whachatcrm.com/share/listings/11111111-1111-1111-1111-111111111111",
});
assert(ogMeta.imageUrl === "https://cdn.example.com/a.jpg", "og image picks first photo");
assert(ogMeta.title.includes("123 Main St"), "og title includes address");
const ogTags = renderListingOpenGraphTags(ogMeta);
assert(ogTags.includes('property="og:url"'), "og:url tag");

const noPhotoHtml = buildPublicListingFlyerHtml({
  listing: { ...listing, photos: [], latitude: null, longitude: null },
  agent: { name: null, email: null, phone: null, avatarUrl: null, brokerageName: null, bookingLink: null },
  shareUrl: "https://app.example.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(!noPhotoHtml.includes('class="gallery"'), "gallery hidden without photos");
assert(noPhotoHtml.includes("View on map"), "address map link fallback");

console.log("inventory-public-flyer.test.ts: OK");
