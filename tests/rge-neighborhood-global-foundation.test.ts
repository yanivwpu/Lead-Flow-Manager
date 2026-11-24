import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBoundaryCountry, normalizeBoundaryPlace, exactNeighborhoodIdentityMatch } from "../shared/agent/neighborhoodBoundaryIdentity";
import { normalizeNeighborhoodName, coordinateWithinNeighborhood, type PolygonBoundary } from "../shared/agent/neighborhoodListingGeo";
import { validateAgentDefinedArea } from "../shared/agent/neighborhoodCustomArea";
import { resolvePageNeighborhoodBoundary } from "../server/agentPage/neighborhoodBoundaryService";
import { neighborhoodTitle } from "../shared/agent/neighborhoodPages";
import { sameNeighborhoodContent, EMPTY_NEIGHBORHOOD } from "../client/src/lib/neighborhoodDrafts";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

const area: PolygonBoundary = { type: "Polygon", coordinates: [[
  [-80.14, 26.11], [-80.12, 26.11], [-80.12, 26.13], [-80.14, 26.13], [-80.14, 26.11],
]] };

test("ISO countries, Unicode names and city identity never collide across countries", () => {
  assert.equal(normalizeBoundaryCountry("us"), "US");
  assert.equal(normalizeBoundaryCountry("IL"), "IL");
  assert.equal(normalizeBoundaryCountry("GB"), "GB");
  assert.equal(normalizeBoundaryCountry("ZZ"), null);
  assert.equal(normalizeBoundaryCountry("Canada"), null);
  assert.equal(normalizeBoundaryPlace("רמת גן"), "רמת גן");
  assert.equal(normalizeNeighborhoodName("שכונת פלורנטין"), "שכונת פלורנטין");
  assert.equal(normalizeBoundaryPlace("El Raval"), "el raval");
  assert.equal(normalizeBoundaryPlace("Cañón de San José"), "cañón de san josé");
  assert.equal(normalizeNeighborhoodName("Victoria Park Civic Association"), "victoria park");
  const london = { name: "Victoria Park", city: "London", state: "England", country: "GB" };
  assert.equal(exactNeighborhoodIdentityMatch(london, { ...london }), true);
  assert.equal(exactNeighborhoodIdentityMatch(london, { ...london, country: "US" }), false);
  assert.equal(exactNeighborhoodIdentityMatch(london, { ...london, city: "Manchester" }), false);
  assert.equal(exactNeighborhoodIdentityMatch(london, { ...london, name: "Victoria" }), false);
});

test("agent-authored polygons reject open rings, holes, bowties and oversized regions", () => {
  assert.deepEqual(validateAgentDefinedArea(area), area);
  assert.equal(validateAgentDefinedArea({ type: "Polygon", coordinates: [[
    [-80.14, 26.11], [-80.12, 26.11], [-80.12, 26.13], [-80.14, 26.13],
  ]] }), null);
  assert.equal(validateAgentDefinedArea({ type: "Polygon", coordinates: [
    area.coordinates[0], area.coordinates[0],
  ] }), null, "custom area cannot include holes");
  assert.equal(validateAgentDefinedArea({ type: "Polygon", coordinates: [[
    [-80.14,26.11],[-80.12,26.13],[-80.14,26.13],[-80.12,26.11],[-80.14,26.11],
  ]] }), null, "self-intersection rejected");
  assert.equal(validateAgentDefinedArea({ type: "Polygon", coordinates: [[
    [-80,26],[-70,26],[-70,27],[-80,27],[-80,26],
  ]] }), null, "large region cannot masquerade as neighborhood");
  assert.equal(validateAgentDefinedArea({ type: "MultiPolygon", coordinates: [area.coordinates] }), null);
  assert.equal(coordinateWithinNeighborhood(26.12, -80.13, area), true);
  assert.equal(coordinateWithinNeighborhood(26.25, -80.13, area), false);
});

test("unsupported worldwide neighborhood can use a clearly agent-defined area, never 'verified'", async () => {
  const input = {
    name: "Neve Tzedek", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
    customBoundary: { type: "Polygon", coordinates: [[
      [34.76,32.06],[34.77,32.06],[34.77,32.07],[34.76,32.07],[34.76,32.06],
    ]] },
  };
  const result = await resolvePageNeighborhoodBoundary(input);
  assert.equal(result.status, "custom_area");
  assert.equal(result.source, "Agent-defined service area");
  assert.equal((await resolvePageNeighborhoodBoundary({ ...input, customBoundary: null })).status, "unsupported");
  assert.equal((await resolvePageNeighborhoodBoundary({ ...input, country: "ZZ" })).status, "unsupported");
});

test("existing US titles/drafts remain unchanged, new non-US titles carry country identity", () => {
  assert.equal(neighborhoodTitle({ name: "Victoria Park", city: "Fort Lauderdale", state: "Florida" }), "Victoria Park, Fort Lauderdale, Florida");
  assert.equal(neighborhoodTitle({ name: "Victoria Park", city: "Fort Lauderdale", state: "Florida", country: "US" }), "Victoria Park, Fort Lauderdale, Florida");
  assert.equal(neighborhoodTitle({ name: "Florentin", city: "Tel Aviv", state: "Tel Aviv", country: "IL" }), "Florentin, Tel Aviv, Tel Aviv, IL");
  assert.equal(sameNeighborhoodContent(EMPTY_NEIGHBORHOOD, { ...EMPTY_NEIGHBORHOOD, country: "US" }), true);
  assert.equal(sameNeighborhoodContent(EMPTY_NEIGHBORHOOD, { ...EMPTY_NEIGHBORHOOD, country: "GB" }), false);
  assert.equal(sameNeighborhoodContent(EMPTY_NEIGHBORHOOD, { ...EMPTY_NEIGHBORHOOD, customBoundary: area }), false);
});

test("public custom area is explicitly labeled and never represented as official neighborhood GIS", () => {
  const html = buildPublicAgentPageHtml({
    userId: "owner-1", agentPageSlug: "agent", displayName: "Sample Agent",
    bio: "Local guide", marketArea: "Fort Lauderdale", brokerageName: "Example Realty",
    avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "9545550100", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true,
    agentPageUrl: "https://app.whachatcrm.com/agents/agent",
    canonicalUrl: "https://app.whachatcrm.com/agents/agent/victoria-park",
    allowSearchIndexing: true, listings: [], browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    neighborhood: { name: "Victoria Park", city: "Fort Lauderdale", state: "Florida", country: "US",
      slug: "victoria-park", parentUrl: "https://app.whachatcrm.com/agents/agent",
      content: "Local guide", photos: [] },
    neighborhoodListings: { boundaryStatus: "custom_area", boundarySource: "Agent-defined service area",
      mode: "public", sale: [], rent: [], hasOlderMatchingInventory: false },
  });
  assert.match(html, /Agent-defined service area/);
  assert.match(html, /not verified by the city/);
  assert.match(html, /id="neighborhood-filters"/);
  assert.doesNotMatch(html, /Properties are matched by verified neighborhood boundaries/);
});
