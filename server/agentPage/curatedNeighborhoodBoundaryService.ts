import { and, eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { neighborhoodCuratedBoundaries } from "@shared/schema";
import { normalizeBoundaryCountry, normalizeBoundaryPlace, type NeighborhoodBoundaryIdentity } from "@shared/agent/neighborhoodBoundaryIdentity";
import {
  selectCuratedNeighborhoodBoundary,
  type CuratedBoundarySelection, type CuratedNeighborhoodBoundaryRecord,
} from "@shared/agent/neighborhoodCuratedBoundary";

/**
 * The catalog starts empty and is deliberately disabled until a licensed,
 * locally preprocessed country+city index has been reviewed and imported.
 * No global Parquet scan occurs inside HTTP request processing.
 */
export async function resolveCuratedNeighborhoodBoundary(
  identity: NeighborhoodBoundaryIdentity,
): Promise<CuratedBoundarySelection | { status: "unavailable" } | null> {
  if (process.env.RGE_OVERTURE_BOUNDARIES_ENABLED !== "true") return null;
  const country = normalizeBoundaryCountry(identity.country);
  if (!country) return { status: "invalid" };
  try {
    const rows = await db.select().from(neighborhoodCuratedBoundaries)
      .where(and(
        eq(neighborhoodCuratedBoundaries.country, country),
        eq(neighborhoodCuratedBoundaries.stateKey, normalizeBoundaryPlace(identity.state)),
        eq(neighborhoodCuratedBoundaries.cityKey, normalizeBoundaryPlace(identity.city)),
        eq(neighborhoodCuratedBoundaries.nameKey, normalizeBoundaryPlace(identity.name)),
        eq(neighborhoodCuratedBoundaries.reviewed, true),
      )).limit(3);
    if (!rows.length) return { status: "unmatched" };
    // A duplicated name or malformed/stale source must fail closed, never
    // quietly switch to a user polygon or city-name lookup.
    const candidates = rows.map((row) => ({
      id: row.id,
      name: row.name, city: row.city, state: row.state, country: row.country,
      sourceId: row.sourceId, sourceVersion: row.sourceVersion,
      sourceKind: row.sourceKind, subtype: row.subtype,
      license: row.license, attribution: row.attribution, geometry: row.geometry,
      reviewed: row.reviewed, retrievedAt: row.retrievedAt,
    } as CuratedNeighborhoodBoundaryRecord));
    return selectCuratedNeighborhoodBoundary(candidates, identity);
  } catch (error) {
    console.warn("[neighborhood-boundaries] curated lookup unavailable", {
      message: error instanceof Error ? error.message : String(error),
    });
    return { status: "unavailable" };
  }
}
