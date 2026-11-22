import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryBounds, coordinateWithinNeighborhood, normalizeNeighborhoodName,
  readBoundaryGeometry, selectExactOfficialNeighborhood, supportsFortLauderdaleBoundary,
  type NeighborhoodBoundary,
} from "../shared/agent/neighborhoodListingGeo";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import type { AgentPageListingCard, NeighborhoodListingRenderData } from "../shared/agent/agentPageTypes";

const ring = [
  [-80.145,26.115],[-80.12,26.115],[-80.12,26.145],
  [-80.145,26.145],[-80.145,26.115],
] as [number,number][];
const boundary: NeighborhoodBoundary = { type: "Polygon", coordinates: [ring] };
const feature = { type: "Feature",
  properties: { OFFICIALNAME: "Victoria Park Civic Association", UNOFFICIALNAME: null },
  geometry: boundary };

test("official association name matches precisely without ZIP/city substitution or fuzzy guesses", () => {
  assert.equal(normalizeNeighborhoodName("Victoria Park Civic Association"), "victoria park");
  assert.equal(supportsFortLauderdaleBoundary("Fort Lauderdale", "Florida"), true);
  assert.equal(supportsFortLauderdaleBoundary("Miami", "Florida"), false);
  assert.deepEqual(selectExactOfficialNeighborhood([feature], "Victoria Park"), boundary);
  assert.equal(selectExactOfficialNeighborhood([feature], "Victoria"), null);
  assert.equal(selectExactOfficialNeighborhood([feature], "Victoria Park East"), null);
  assert.equal(selectExactOfficialNeighborhood([feature, feature], "Victoria Park"), null,
    "ambiguous multiple matches fail closed");
  assert.equal(selectExactOfficialNeighborhood([], "Victoria Park"), null);
});

test("polygon coordinates exclude outside homes, missing coordinates, and polygon holes", () => {
  assert.equal(coordinateWithinNeighborhood(26.13, -80.132, boundary), true);
  assert.equal(coordinateWithinNeighborhood(26.13, -80.18, boundary), false);
  assert.equal(coordinateWithinNeighborhood(null, -80.13, boundary), false);
  assert.equal(coordinateWithinNeighborhood(26.13, undefined, boundary), false);
  assert.deepEqual(boundaryBounds(boundary), {
    minLat: 26.115, maxLat: 26.145, minLon: -80.145, maxLon: -80.12,
  });
  const withHole: NeighborhoodBoundary = { type: "Polygon", coordinates: [ring,
    [[-80.138,26.12],[-80.13,26.12],[-80.13,26.13],[-80.138,26.13],[-80.138,26.12]],
  };
  assert.equal(coordinateWithinNeighborhood(26.125, -80.135, withHole), false);
  assert.equal(coordinateWithinNeighborhood(26.135, -80.135, withHole), true);
  const multi: NeighborhoodBoundary = { type: "MultiPolygon", coordinates: [
    [ring],
    [[[-80.19,26.11],[-80.18,26.11],[-80.18,26.12],[-80.19,26.12],[-80.19,26.11]]],
  ] };
  assert.equal(coordinateWithinNeighborhood(26.115, -80.185, multi), true);
  assert.equal(readBoundaryGeometry({ type: "Point", coordinates: [-80.13,26.13] }), null);
  assert.equal(readBoundaryGeometry({ type: "Polygon", coordinates: [[[-80.13, 26.13]]] }), null);
});

function card(id: string, label: "FOR SALE" | "FOR RENT"): AgentPageListingCard {
  return {
    id, listingLabel: label, shareUrl: "https://app.whachatcrm.com/share/listings/" + id,
    imageUrl: null, street: null, fullAddress: "Fort Lauderdale, FL",
    metaSummary: "$2,000 • 2 bed", cityState: "Fort Lauderdale, FL",
    price: "$2,000", priceCents: 200000, beds: "2 bed", baths: "2 bath",
    sqft: "1,000 Sq Ft", bedsNum: 2, bathsNum: 2, sqftNum: 1000,
    propertyType: "Condo", propertySubtype: null, status: "Active",
  };
}

function html(listings?: NeighborhoodListingRenderData, preview = false): string {
  return buildPublicAgentPageHtml({
    userId: "owner-1", agentPageSlug: "sample-agent", displayName: "Sample Agent",
    bio: "Helping with local real estate.", marketArea: "Fort Lauderdale",
    brokerageName: "Example Realty", avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "9545550100", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true, listings: [],
    browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    agentPageUrl: "https://app.whachatcrm.com/agents/sample-agent",
    canonicalUrl: "https://app.whachatcrm.com/agents/sample-agent/victoria-park",
    allowSearchIndexing: !preview,
    neighborhood: {
      name: "Victoria Park", city: "Fort Lauderdale", state: "Florida",
      slug: "victoria-park", parentUrl: "https://app.whachatcrm.com/agents/sample-agent",
      content: "Helpful neighborhood notes.\n\nOriginal local recommendations.",
      preview,
    },
    neighborhoodListings: listings,
  });
}

test("verified public neighborhood lists For Sale and For Rent with existing inquiry actions", () => {
  const result: NeighborhoodListingRenderData = {
    boundaryStatus: "verified", boundarySource: "Official city GIS", mode: "public",
    sale: [card("sale-1", "FOR SALE")], rent: [card("rent-1", "FOR RENT")],
    hasOlderMatchingInventory: false,
  };
  const rendered = html(result);
  assert.match(rendered, /id="neighborhood-properties"/);
  assert.match(rendered, /id="homes-sale"/);
  assert.match(rendered, /id="homes-rent"/);
  assert.match(rendered, /data-id="sale-1"/);
  assert.match(rendered, /data-id="rent-1"/);
  assert.match(rendered, /data-action="ask_about"/);
  assert.match(rendered, /data-action="schedule"/);
  assert.match(rendered, /href="#neighborhood-properties">Properties/);
  assert.match(rendered, /content="index, follow"/);
  assert.match(rendered, /rel="canonical"/);
});

test("missing boundary or stale owner sample cannot leak MLS cards onto public page", () => {
  const previewListings: NeighborhoodListingRenderData = {
    boundaryStatus: "verified", boundarySource: "Official city GIS", mode: "owner_preview",
    sale: [card("historical-1", "FOR SALE")], rent: [],
    hasOlderMatchingInventory: true,
  };
  assert.doesNotMatch(html(previewListings), /data-id="historical-1"/);
  assert.match(html(previewListings), /No verified for-sale listings/);
  const ownerRendered = html(previewListings, true);
  assert.match(ownerRendered, /data-id="historical-1"/);
  assert.match(ownerRendered, /Private test: these are previously synced listings/);
  assert.match(ownerRendered, /content="noindex, follow"/);
  const unmatched: NeighborhoodListingRenderData = {
    ...previewListings, boundaryStatus: "unmatched", mode: "public",
  };
  assert.doesNotMatch(html(unmatched), /data-id="historical-1"/);
  assert.match(html(unmatched), /requires a verified local boundary/);
});
