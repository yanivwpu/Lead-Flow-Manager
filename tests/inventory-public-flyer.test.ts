/**
 * Public listing flyer HTML builder.
 * Run: npx tsx tests/inventory-public-flyer.test.ts
 */
import {
  buildListingOpenGraphMeta,
  buildPublicListingFlyerHtml,
  inventoryRowToFlyerListing,
  pickFlyerHeroPhotos,
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

assert(html.includes("123 Main St"), "street address");
assert(html.includes("Austin, TX, 78701"), "city state zip line");
assert(html.includes("$450,000"), "formatted price in specs row");
assert(html.includes("1,800 Sq Ft"), "square footage in specs row");
assert(html.includes("HOA $250/mo"), "hoa fee in specs row");
assert(html.includes("Built 1998"), "year built in specs row");
assert(html.includes("3 Beds"), "beds in specs row");
assert(html.includes("2 Baths"), "baths in specs row");
assert(html.includes('class="key-stats"'), "specs row");
const bottomRowMatch = html.match(/class="flyer-bottom-row"[^>]*>([\s\S]*?)<\/section>/);
const bottomRow = bottomRowMatch?.[1] ?? "";
assert(bottomRow.includes("bottom-col-map"), "map column");
assert(bottomRow.includes("bottom-col-qr"), "qr column");
assert(bottomRow.includes("bottom-col-agent"), "agent column");
assert(bottomRow.indexOf("bottom-col-map") < bottomRow.indexOf("bottom-col-qr"), "map before qr");
assert(bottomRow.indexOf("bottom-col-qr") < bottomRow.indexOf("bottom-col-agent"), "qr before agent");
assert(html.includes("Bright corner unit with skyline views."), "description body");
assert(html.includes(">Description<"), "description heading");
assert(!html.includes("Property Details"), "no property details section");
assert(!html.includes("Features &amp; amenities"), "no features section");
assert(!html.includes("Hardwood floors"), "features list removed");
assert(!html.includes("map-address"), "no duplicate address in map block");
assert(html.includes("flyer-bottom-row"), "three-column bottom row");
assert(html.includes("qr-block"), "qr present");
assert(html.includes("Scan To View Listing"), "qr headline");
assert(html.includes("Open listing on your phone"), "qr helper text");
assert(html.includes("hero-img"), "gallery hero");
assert(html.includes("print-photo-strip"), "print-only secondary photo strip");
assert(html.includes("cdn.example.com/b.jpg"), "secondary photo in print strip");
assert(html.includes("map-print-static"), "print static map image");
assert(html.includes("staticmap.openstreetmap.de"), "static map url for print");
assert(html.includes("map-embed-interactive"), "interactive map for screen only");
assert(html.includes("grid-template-columns: minmax(0, 3fr)"), "30/30/40 bottom grid");
assert(html.includes("gallery:has(.print-photo-strip) .hero-wrap { height: 3.85in"), "hero trims when strip present");
assert(html.includes("FOR SALE"), "for sale header label");
assert(!html.includes("Active"), "no MLS status on flyer");
assert(html.includes("Jane Agent"), "agent name");
assert(html.includes("Contact Agent"), "agent CTA");
assert(html.includes("Powered by WhachatCRM"), "powered-by footer");
assert(html.includes("listing-banner"), "for sale banner");
assert(html.includes("property-street"), "split address street line");
assert(html.includes("height: 4.1in"), "print hero height ~40% page");
assert(html.includes("print-hint"), "print hint near actions");
assert(html.includes("turn off browser Headers and footers"), "print hint copy");
assert(html.includes("--brand-green"), "brand green design token in styles");
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
assert(noPhotoHtml.includes("qr-block"), "qr still shown without map coords");

const onePhotoHtml = buildPublicListingFlyerHtml({
  listing: { ...listing, photos: [{ url: "https://cdn.example.com/only.jpg", order: 0 }] },
  agent: {
    name: "Jane Agent",
    email: "jane@broker.com",
    phone: "+1 512-555-0100",
    avatarUrl: null,
    brokerageName: "Summit Realty",
    bookingLink: null,
  },
  shareUrl: "https://app.whachatcrm.com/share/listings/x",
  qrDataUrl: "data:image/png;base64,TEST",
});
assert(
  !onePhotoHtml.includes('<div class="print-photo-strip print-only"'),
  "no print strip with single photo",
);

const heroPhotos = pickFlyerHeroPhotos([
  { url: "https://cdn.example.com/a-watermark.jpg", order: 0 },
  { url: "https://cdn.example.com/b-clean.jpg", order: 1 },
]);
assert(heroPhotos[0]?.url.includes("b-clean"), "prefer clean hero over watermarked primary");

const onlyWatermarked = pickFlyerHeroPhotos([
  { url: "https://cdn.example.com/x-watermark.jpg", order: 0 },
  { url: "https://cdn.example.com/y-watermark.jpg", order: 1 },
]);
assert(onlyWatermarked[0]?.url.includes("x-watermark"), "keep order when all watermarked");

console.log("inventory-public-flyer.test.ts: OK");
