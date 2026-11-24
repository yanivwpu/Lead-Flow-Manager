/**
 * Country-aware identity for neighborhood boundaries. Country is ISO 3166-1
 * alpha-2; legacy pages created before this column existed are US pages.
 * Region and locality stay exact (not ZIP, city substring or bounding-box).
 */
export function normalizeBoundaryCountry(value: string | null | undefined): string | null {
  const raw = String(value ?? "US").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw) || raw === "ZZ") return null;
  try {
    const label = new Intl.DisplayNames(["en"], { type: "region" }).of(raw);
    return label && label !== raw && label !== "Unknown Region" ? raw : null;
  } catch {
    return null;
  }
}

export function normalizeBoundaryPlace(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("und")
    .replace(/[^\p{L}\p{M}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ").trim();
}

export type NeighborhoodBoundaryIdentity = {
  name: string;
  city: string;
  state: string;
  country?: string | null;
};

export function exactNeighborhoodIdentityMatch(
  a: NeighborhoodBoundaryIdentity,
  b: NeighborhoodBoundaryIdentity,
): boolean {
  const countryA = normalizeBoundaryCountry(a.country);
  const countryB = normalizeBoundaryCountry(b.country);
  return countryA !== null && countryA === countryB &&
    normalizeBoundaryPlace(a.name) !== "" &&
    normalizeBoundaryPlace(a.name) === normalizeBoundaryPlace(b.name) &&
    normalizeBoundaryPlace(a.city) !== "" &&
    normalizeBoundaryPlace(a.city) === normalizeBoundaryPlace(b.city) &&
    normalizeBoundaryPlace(a.state) !== "" &&
    normalizeBoundaryPlace(a.state) === normalizeBoundaryPlace(b.state);
}
