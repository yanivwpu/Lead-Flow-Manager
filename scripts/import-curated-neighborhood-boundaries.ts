/**
 * Bounded offline ingest of PREPROCESSED Overture neighborhoods (not raw
 * division_area Parquet). A human/operator must establish country, city and
 * region from the division hierarchy and assess license/geometry beforehand.
 *
 * Usage:
 *   node --import tsx scripts/import-curated-neighborhood-boundaries.ts ./index.json
 *   RGE_CURATED_BOUNDARY_IMPORT_ALLOWED=true node --import tsx scripts/import-curated-neighborhood-boundaries.ts ./index.json --apply
 *
 * Import NEVER approves rows for public use; reviewed=false by default.
 * Review must happen in a separate audited operation before enabling runtime.
 */
import { readFileSync, statSync } from "node:fs";
import { normalizeBoundaryCountry, normalizeBoundaryPlace } from "../shared/agent/neighborhoodBoundaryIdentity";
import {
  OVERTURE_NEIGHBORHOOD_ATTRIBUTION, OVERTURE_NEIGHBORHOOD_LICENSE,
} from "../shared/agent/neighborhoodCuratedBoundary";
import { boundaryBounds, readBoundaryGeometry } from "../shared/agent/neighborhoodListingGeo";

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file || !file.endsWith(".json")) {
  throw new Error("Specify a preprocessed JSON array, e.g. ./boundaries.json");
}
if (statSync(file).size > 8 * 1024 * 1024) throw new Error("Input exceeds 8 MiB");
const input: unknown = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(input) || input.length < 1 || input.length > 500) {
  throw new Error("Use a bounded batch of 1 to 500 reviewed source candidates");
}
type Ready = {
  id: string; country: string; state: string; city: string; name: string;
  stateKey: string; cityKey: string; nameKey: string;
  sourceKind: string; sourceId: string; sourceVersion: string; subtype: string;
  license: string; attribution: string; geometry: NonNullable<ReturnType<typeof readBoundaryGeometry>>;
  reviewed: boolean; retrievedAt: Date;
};
const rows: Ready[] = [];
const seen = new Set<string>();
for (const [index, candidate] of input.entries()) {
  if (!candidate || typeof candidate !== "object") throw new Error("Invalid record " + index);
  const item = candidate as Record<string, unknown>;
  const country = normalizeBoundaryCountry(typeof item.country === "string" ? item.country : null);
  const state = typeof item.state === "string" ? item.state.trim() : "";
  const city = typeof item.city === "string" ? item.city.trim() : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const sourceId = typeof item.sourceId === "string" ? item.sourceId : "";
  const sourceVersion = typeof item.sourceVersion === "string" ? item.sourceVersion : "";
  const subtype = item.subtype;
  const license = item.license;
  const attribution = item.attribution;
  const geometry = readBoundaryGeometry(item.geometry);
  const retrievedAt = new Date(String(item.retrievedAt ?? ""));
  if (!country || !state || !city || !name || !normalizeBoundaryPlace(name) ||
      sourceId.length < 5 || sourceId.length > 128 ||
      !/^[a-zA-Z0-9:-]+$/.test(sourceId) ||
      !/^20\d\d-\d\d-\d\d\.\d+$/.test(sourceVersion) ||
      !["neighborhood","microhood"].includes(String(subtype)) ||
      license !== OVERTURE_NEIGHBORHOOD_LICENSE ||
      attribution !== OVERTURE_NEIGHBORHOOD_ATTRIBUTION ||
      !geometry || !Number.isFinite(retrievedAt.getTime()) ||
      retrievedAt.getTime() > Date.now() ||
      Date.now() - retrievedAt.getTime() > 180 * 86400000) {
    throw new Error("Source, license, identity, age or geometry invalid at record " + index);
  }
  const bounds = boundaryBounds(geometry);
  if (bounds.maxLon - bounds.minLon <= 0 || bounds.maxLat - bounds.minLat <= 0 ||
      bounds.maxLon - bounds.minLon > 1 || bounds.maxLat - bounds.minLat > 1) {
    throw new Error("Neighborhood geometry outside local bounds at " + index);
  }
  const id = "overture:" + sourceId;
  if (seen.has(id)) throw new Error("Duplicate source ID " + id);
  seen.add(id);
  rows.push({
    id, country, state, city, name,
    stateKey: normalizeBoundaryPlace(state), cityKey: normalizeBoundaryPlace(city),
    nameKey: normalizeBoundaryPlace(name), sourceKind: "overture", sourceId, sourceVersion,
    subtype: String(subtype), license: String(license), attribution: String(attribution),
    geometry, reviewed: false, retrievedAt,
  });
}
const summary = {
  records: rows.length, countries: [...new Set(rows.map((row) => row.country))],
  sourceVersion: [...new Set(rows.map((row) => row.sourceVersion))],
  reviewed: false, mode: apply ? "append-unreviewed" : "dry-run",
};
if (!apply) {
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
} else {
  if (process.env.RGE_CURATED_BOUNDARY_IMPORT_ALLOWED !== "true") {
    throw new Error("Set RGE_CURATED_BOUNDARY_IMPORT_ALLOWED=true only during the approved operator window");
  }
  const { db } = await import("../drizzle/db");
  const { neighborhoodCuratedBoundaries } = await import("../shared/schema");
  for (let offset = 0; offset < rows.length; offset += 50) {
    await db.insert(neighborhoodCuratedBoundaries).values(rows.slice(offset, offset + 50))
      .onConflictDoNothing();
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
}
