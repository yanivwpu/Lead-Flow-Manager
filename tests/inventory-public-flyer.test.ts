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
assert(html.includes("$450,000"), "formatted price in specs row");
assert(html.includes("1,800 Sq Ft"), "square footage in specs row");
assert(html.includes("HOA $250/mo"), "hoa fee in specs row");
assert(html.includes("Built 1998"), "year built in specs row");
assert(html.includes('class="key-stats"'), "specs row");
assert(html.indexOf('class="main-col"') < html.indexOf('class="side-col"'), "main column before sidebar");
assert(html.includes("Bright corner unit with skyline views."), "description body");
assert(html.includes(">Description<"), "description heading");
assert(!html.includes("Property Details"), "no property details section");
assert(!html.includes("Features &amp; amenities"), "no features section");
assert(!html.includes("Hardwood floors"), "features list removed");
assert(!html.includes("map-address"), "no duplicate address in map block");
assert(html.includes("map-qr-row"), "map and qr grouped");
assert(html.includes("class=\"map-qr\""), "qr present");
assert(html.includes("hero-img"), "gallery hero");
assert(html.includes("FOR SALE"), "for sale header label");
assert(!html.includes("Active"), "no MLS status on flyer");
assert(html.includes("Jane Agent"), "agent name");
assert(html.includes("Contact Agent"), "agent CTA");
assert(html.includes("Powered by WhachatCRM"), "powered-by footer");
assert(html.includes('fill="#059669"'), "brand green W logo");
assert(!html.includes('fill="#22c55e"'), "no incorrect bright green");
assert(html.includes("@page"), "print page rules");
assert(!html.includes("page-break-before: always"), "single-page print layout");
assert(html.includes("openstreetmap.org"), "map embed");

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

const rentalListing = inventoryRowToFlyerListing({
  ...listing,
  id: "rent-1",
  propertyType: "residential_lease",
  propertySubtype: "Apartment",
  squareFeet: null,
  hoaFeeCents: null,
});
assert(resolveFlyerListingLabel(rentalListing) === "FOR RENT", "rental label");

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
assert(noPhotoHtml.includes("class=\"map-qr\""), "qr still shown without map coords");

console.log("inventory-public-flyer.test.ts: OK");
