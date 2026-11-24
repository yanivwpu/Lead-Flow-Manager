import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCustomNeighborhoodBoundary } from "../shared/agent/neighborhoodCustomBoundary";
import { coordinateWithinNeighborhood, type PolygonBoundary } from "../shared/agent/neighborhoodListingGeo";
import { resolveNeighborhoodBoundary } from "../server/agentPage/neighborhoodBoundaryService";
import { EMPTY_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts, writeNeighborhoodDrafts } from "../client/src/lib/neighborhoodDrafts";

const square: PolygonBoundary = { type: "Polygon", coordinates: [[
  [-80.15, 26.12], [-80.14, 26.12], [-80.14, 26.13],
  [-80.15, 26.13], [-80.15, 26.12],
]] };

test("agent boundary is a valid small, closed polygon; inside/outside are exact", () => {
  assert.deepEqual(readCustomNeighborhoodBoundary(square), square);
  assert.deepEqual(readCustomNeighborhoodBoundary({ ...square, extra: "ignored" }), square);
  assert.equal(coordinateWithinNeighborhood(26.125, -80.145, square), true);
  assert.equal(coordinateWithinNeighborhood(26.16, -80.145, square), false);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Point", coordinates: [-80.14, 26.12] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "MultiPolygon", coordinates: [square.coordinates] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ ...square, coordinates: [[...square.coordinates[0].slice(0, -1)]] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [square.coordinates[0], square.coordinates[0]] }), null);
});

test("custom area rejects crossed, huge and repeated or out-of-range rings", () => {
  const bowTie = { type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-80.14, 26.13], [-80.15, 26.13],
    [-80.14, 26.12], [-80.15, 26.12],
  ]] };
  assert.equal(readCustomNeighborhoodBoundary(bowTie), null);
  const huge = { type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-79.15, 26.12], [-79.15, 27.12],
    [-80.15, 27.12], [-80.15, 26.12],
  ]] };
  assert.equal(readCustomNeighborhoodBoundary(huge), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [[
    [-80.15, 26.12], [-80.14, 26.12], [-80.14, 26.12],
    [-80.15, 26.13], [-80.15, 26.12],
  ]] }), null);
  assert.equal(readCustomNeighborhoodBoundary({ type: "Polygon", coordinates: [[
    [-180, 26.12], [180, 26.12], [180, 26.13], [-180, 26.13], [-180, 26.12],
  ]] }), null);
});

test("owner-defined geometry stays explicitly labeled and does not call unsupported official GIS", async () => {
  const result = await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL", customBoundary: square,
  });
  assert.equal(result.status, "custom");
  if (result.status === "custom") {
    assert.match(result.source, /Agent-defined.*not official GIS/);
    assert.equal(result.bounds.minLon, -80.15);
  }
  assert.equal((await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
  })).status, "unsupported");
  assert.equal((await resolveNeighborhoodBoundary({
    name: "נווה צדק", city: "Tel Aviv", state: "Tel Aviv", country: "IL",
    customBoundary: { type: "Polygon", coordinates: [] },
  })).status, "unmatched");
});

test("agent custom area draft survives reload and remains tenant isolated", () => {
  const key = neighborhoodDraftKey("agent-area-owner");
  const records = new Map<string, string>();
  const storage = {
    getItem: (k: string) => records.get(k) ?? null,
    setItem: (k: string, v: string) => { records.set(k, v); },
    removeItem: (k: string) => { records.delete(k); },
  };
  writeNeighborhoodDrafts(storage, key, { active: "new", entries: {
    new: { values: { ...EMPTY_NEIGHBORHOOD, city: "Miami", customBoundary: square }, baseVersion: null },
  } });
  assert.deepEqual(readNeighborhoodDrafts(storage, key).entries.new.values.customBoundary, square);
  assert.equal(readNeighborhoodDrafts(storage, neighborhoodDraftKey("someone-else")).entries.new, undefined);
  records.set(key, JSON.stringify({ active: "new", entries: { new: {
    values: { ...EMPTY_NEIGHBORHOOD, customBoundary: { type: "Polygon", coordinates: [] } },
    baseVersion: null,
  } } }));
  assert.equal(readNeighborhoodDrafts(storage, key).entries.new, undefined);
});

test("owner endpoints, public HTML, persistence and map editing retain custom-area safeguards", () => {
  const api = readFileSync("server/routes/agentNeighborhoodPages.ts", "utf8");
  const listings = readFileSync("server/agentPage/neighborhoodListings.ts", "utf8");
  const html = readFileSync("shared/agent/publicAgentPageHtml.ts", "utf8");
  const editor = readFileSync("client/src/components/agentPage/NeighborhoodBoundaryEditor.tsx", "utf8");
  const migration = readFileSync("migrations/20261124_agent_neighborhood_custom_boundary.sql", "utf8");
  assert.match(api, /readCustomNeighborhoodBoundary\(value\)/);
  assert.match(api, /router\.use\(\(req, res, next\)/);
  assert.match(listings, /boundary\.status === "custom"/);
  assert.match(listings, /row\.country/);
  assert.match(listings, /row\.city/);
  assert.match(html, /agent-defined custom area, not an official neighborhood boundary/);
  assert.match(editor, /Apply this area/);
  assert.match(editor, /Remove custom area/);
  assert.match(editor, /© OpenStreetMap contributors/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS custom_boundary jsonb/);
});
