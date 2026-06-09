/**
 * Public listing flyer HTML builder.
 * Run: npx tsx tests/inventory-public-flyer.test.ts
 */
import {
  buildListingOpenGraphMeta,
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
  renderListingOpenGraphTags,
  resolveDisplayHoaFee,
  resolveDisplaySquareFeet,
  resolveFlyerListingLabel,
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

assert(html.includes("123 Main St"), "address in headline");
assert(html.includes("$450,000"), "formatted price in details");
assert(!html.includes('class="price-line"'), "no duplicate price in headline");
assert(!html.includes('class="highlights"'), "no duplicate highlight pills");
assert(html.includes("1,800 Sq Ft"), "square footage");
assert(html.includes("HOA $250/mo"), "hoa fee");
assert(html.includes('class="key-stats"'), "key stats row");
assert(html.includes("layout-page1"), "page1 layout wrapper");
assert(html.indexOf('class="main-col"') < html.indexOf('class="side-col"'), "main column before sidebar in DOM");
assert(html.includes("Built 1998"), "year built in specs row");
assert(!html.includes("Features &amp; amenities"), "no features section");
assert(!html.includes("Hardwood floors"), "features list removed");
assert(html.includes("details-panel"), "mobile details accordion");
assert(html.includes("MLS-12345"), "MLS id");
assert(html.includes("hero-img"), "gallery hero");
assert(html.includes("gallery-prev"), "gallery prev arrow");
assert(html.includes("gallery-next"), "gallery next arrow");
assert(html.includes("class=\"thumb"), "thumbnail gallery");
assert(!html.includes("WhaChatCRM Listing"), "no legacy header text");
assert(html.includes("FOR SALE"), "for sale header label");
assert(!html.includes("Active"), "no MLS status on flyer");
assert(!html.includes("status-badge"), "no status badge");
assert(html.includes('aria-label="Print flyer"'), "print icon button");
assert(html.includes('aria-label="Share listing"'), "share icon button");
assert(html.includes("Jane Agent"), "agent name");
assert(html.includes("Summit Realty"), "brokerage");
assert(html.includes("Contact Agent"), "agent CTA without booking link");
assert(html.includes("Powered by WhachatCRM"), "powered-by footer");
assert(html.includes('href="https://whachatcrm.com"'), "powered-by link");
assert(html.includes('fill="#22c55e"'), "green W logo in footer");
assert(html.includes("Open in Google Maps"), "google maps link");
assert(html.includes("class=\"map-qr\""), "qr near map");
assert(!html.includes("Scan to view live listing"), "no qr scan text");
assert(!html.includes("qr-footer"), "no separate qr footer");
assert(html.includes('name="robots" content="index, follow"'), "seo robots");
assert(html.includes('rel="canonical"'), "canonical url");

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
assert(bookingHtml.includes("Schedule Showing"), "primary booking CTA");
assert(bookingHtml.includes("https://calendly.com/jane/showing"), "booking URL");
assert(bookingHtml.includes("Contact Agent"), "secondary contact CTA with booking");
assert(html.includes("Scan to view live listing") === false, "no scan label");
assert(html.includes("openstreetmap.org"), "map embed when lat/lng present");
assert(html.includes("map-embed-wrap"), "map aspect ratio wrapper");
assert(html.includes("print-additional-details"), "print page 2 details block");
assert(html.includes("@media print"), "print styles");
assert(html.includes('property="og:title"'), "open graph title tag");
assert(html.includes('property="og:image"'), "open graph image tag");
assert(html.includes("https://cdn.example.com/a.jpg"), "primary photo in og:image");
assert(html.includes("Listed by Jane Agent"), "agent in og:description");
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

const logoHtml = buildPublicListingFlyerHtml({
  listing,
  agent: { name: "Jane", email: null, phone: null, avatarUrl: null, brokerageName: "Co", bookingLink: null },
  shareUrl: "https://app.example.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
  companyLogoUrl: "https://cdn.example.com/logo.png",
});
assert(logoHtml.includes("agent-company-logo"), "company logo in agent card");
assert(!logoHtml.includes("header-logo"), "no company logo in header");

const rentalListing = inventoryRowToFlyerListing({
  ...listing,
  id: "rent-1",
  propertyType: "residential_lease",
  propertySubtype: "Apartment",
  squareFeet: null,
  hoaFeeCents: null,
});
assert(resolveFlyerListingLabel(rentalListing) === "FOR RENT", "rental label");
const rentalHtml = buildPublicListingFlyerHtml({
  listing: rentalListing,
  agent: { name: "Jane", email: null, phone: null, avatarUrl: null, brokerageName: null, bookingLink: null },
  shareUrl: "https://app.example.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(rentalHtml.includes("FOR RENT"), "for rent header");

const parsedSqft = inventoryRowToFlyerListing({
  ...listing,
  squareFeet: null,
  features: ["2,450 sq ft living area"],
});
assert(resolveDisplaySquareFeet(parsedSqft) === "2,450 Sq Ft", "sqft parsed from features");

const parsedHoa = inventoryRowToFlyerListing({
  ...listing,
  hoaFeeCents: null,
  features: ["HOA $325/mo"],
});
assert(resolveDisplayHoaFee(parsedHoa) === "HOA $325/mo", "hoa parsed from features");

const noPhotoHtml = buildPublicListingFlyerHtml({
  listing: { ...listing, photos: [], latitude: null, longitude: null },
  agent: { name: null, email: null, phone: null, avatarUrl: null, brokerageName: null, bookingLink: null },
  shareUrl: "https://app.example.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(!noPhotoHtml.includes('class="gallery"'), "gallery hidden without photos");
assert(noPhotoHtml.includes("Open in Google Maps"), "address google maps fallback");

console.log("inventory-public-flyer.test.ts: OK");
