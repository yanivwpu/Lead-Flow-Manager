/**
 * Registry of geographic divider references for buyer geo constraints.
 * Matching logic reads from this registry — add new cities/roads here without changing the matcher.
 */

export type GeoReferenceAxis = "longitude" | "latitude";

export type GeoSide = "east" | "west" | "north" | "south";

export type GeoReferenceDefinition = {
  id: string;
  /** Human label, e.g. "Federal Hwy / US-1" */
  label: string;
  /** Axis used to compare listing coordinates against the divider. */
  axis: GeoReferenceAxis;
  /**
   * Divider value on that axis.
   * For longitude in South Florida: east = greater longitude (less negative).
   */
  dividerValue: number;
  /** Listing city must match one of these keys (normalized substring match). */
  cityKeys: string[];
  /** Phrases that identify this road/divider in buyer text. */
  roadAliases: string[];
  /**
   * When true (default for longitude): east means coordinate > dividerValue.
   * When false: east means coordinate < dividerValue.
   */
  eastMeansGreater?: boolean;
};

/** v1 registry — extend with additional entries per market. */
export const geoReferenceRegistry: Record<string, GeoReferenceDefinition> = {
  pompano_federal_us1: {
    id: "pompano_federal_us1",
    label: "Federal Hwy / US-1",
    axis: "longitude",
    dividerValue: -80.108,
    cityKeys: ["pompano beach", "pompano"],
    roadAliases: [
      "federal hwy",
      "federal highway",
      "federal",
      "us-1",
      "us 1",
      "us1",
      "dixie highway",
      "dixie hwy",
      "dixie",
      "north federal",
      "south federal",
    ],
    eastMeansGreater: true,
  },
};

export function getGeoReference(referenceId: string): GeoReferenceDefinition | undefined {
  return geoReferenceRegistry[referenceId];
}

export function listGeoReferences(): GeoReferenceDefinition[] {
  return Object.values(geoReferenceRegistry);
}
