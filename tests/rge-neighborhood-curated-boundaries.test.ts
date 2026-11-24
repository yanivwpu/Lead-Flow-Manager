import assert from "node:assert/strict";
import test from "node:test";
import {
  selectCuratedNeighborhoodBoundary,
  OVERTURE_NEIGHBORHOOD_ATTRIBUTION,
  OVERTURE_NEIGHBORHOOD_LICENSE,
  type CuratedNeighborhoodBoundaryRecord,
} from "../shared/agent/neighborhoodCuratedBoundary";

const area = { type: "Polygon" as const, coordinates: [[
  [2.32, 48.83], [2.34, 48.83], [2.34, 48.85], [2.32, 48.85], [2.32, 48.83],
] as [number,number][]] };
function record(overrides: Partial<CuratedNeighborhoodBoundaryRecord> = {}): CuratedNeighborhoodBoundaryRecord {
  return {
    id: "b1", sourceId: "overture:valid-123", sourceVersion: "2026-11-18.0",
    sourceKind: "overture", subtype: "neighborhood",
    name: "Montparnasse", country: "FR", state: "Île-de-France", city: "Paris",
    geometry: area, license: OVERTURE_NEIGHBORHOOD_LICENSE,
    attribution: OVERTURE_NEIGHBORHOOD_ATTRIBUTION,
    reviewed: true, retrievedAt: new Date("2026-11-20T10:00:00Z"),
    ...overrides,
  };
}
const identity = { name: "Montparnasse", country: "FR", state: "Île-de-France", city: "Paris" };
const now = new Date("2026-11-24T10:00:00Z");

test("reviewed Overture neighborhood selects exact city, country and original geometry", () => {
  const selection = selectCuratedNeighborhoodBoundary([record()], identity, now);
  assert.equal(selection.status, "community_area");
  if (selection.status === "community_area") {
    assert.deepEqual(selection.geometry, area);
    assert.equal(selection.attribution, OVERTURE_NEIGHBORHOOD_ATTRIBUTION);
    assert.notEqual(selection.source, "Official municipal GIS");
  }
  assert.equal(selectCuratedNeighborhoodBoundary([record()], { ...identity, country: "CA" }, now).status, "unmatched");
  assert.equal(selectCuratedNeighborhoodBoundary([record()], { ...identity, state: "Normandy" }, now).status, "unmatched");
  assert.equal(selectCuratedNeighborhoodBoundary([record()], { ...identity, city: "Nice" }, now).status, "unmatched");
  assert.equal(selectCuratedNeighborhoodBoundary([record()], { ...identity, name: "Mont" }, now).status, "unmatched");
});
test("ambiguous, unreviewed, stale, unlicensed and invalid source polygons fail closed", () => {
  assert.equal(selectCuratedNeighborhoodBoundary([record(), record({ id: "b2", sourceId: "overture:valid-456" })], identity, now).status, "ambiguous");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ reviewed: false })], identity, now).status, "unmatched");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ retrievedAt: "2025-01-01T10:00:00Z" })], identity, now).status, "stale");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ license: "unknown" })], identity, now).status, "invalid");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ sourceVersion: "draft" })], identity, now).status, "invalid");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ attribution: "" })], identity, now).status, "invalid");
  assert.equal(selectCuratedNeighborhoodBoundary([record({ geometry: { type: "Polygon", coordinates: [[]] } })], identity, now).status, "invalid");
});
