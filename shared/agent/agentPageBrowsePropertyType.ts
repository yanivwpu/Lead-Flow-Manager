import { mapResoPropertyType } from "../inventory/reso/resoListingClassification";

/** Coarse browse buckets used by Agent Page filter UI. */
export type AgentPageBrowsePropertyBucket =
  | "house"
  | "condo"
  | "townhouse"
  | "multi_family"
  | "land"
  | "other";

const SFH_SIGNAL_RE =
  /\b(single[\s_]?family[\s_]?residence|single[\s_]?family[\s_]?home|single[\s_]?family|sfh|sfr|detached)\b/;

function propertyHaystack(
  propertyType: string | null | undefined,
  propertySubtype: string | null | undefined,
): string {
  return `${propertyType ?? ""} ${propertySubtype ?? ""}`
    .trim()
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, " ");
}

function hasSfhSignal(
  propertyType: string | null | undefined,
  propertySubtype: string | null | undefined,
): boolean {
  const hay = propertyHaystack(propertyType, propertySubtype);
  if (!hay) return false;
  return SFH_SIGNAL_RE.test(hay);
}

function residentialLeaseShouldBeHouse(
  propertyType: string | null | undefined,
  propertySubtype: string | null | undefined,
): boolean {
  const hay = propertyHaystack(propertyType, propertySubtype);
  if (!/\b(residential[\s_]?lease|lease[\s_]?only|rental)\b/.test(hay)) return false;
  if (/\b(condo|condominium|apartment|townhouse|town[\s_]?house|multi|duplex)\b/.test(hay)) {
    return false;
  }
  return hasSfhSignal(propertyType, propertySubtype) || /\bresidence\b/.test(hay);
}

/**
 * Map MLS property type + subtype to Agent Page browse filter buckets.
 * House includes detached / SFH rentals stored as Residential Lease + SFR subtype.
 */
export function normalizeAgentPageBrowsePropertyType(
  propertyType: string | null | undefined,
  propertySubtype: string | null | undefined,
): AgentPageBrowsePropertyBucket {
  const mapped = mapResoPropertyType(propertyType, propertySubtype);

  if (mapped === "house") return "house";
  if (mapped === "condo") return "condo";
  if (mapped === "townhouse" || mapped === "villa") return "townhouse";
  if (mapped === "multi_family") return "multi_family";
  if (mapped === "land") return "land";

  if (mapped === "residential_lease" && residentialLeaseShouldBeHouse(propertyType, propertySubtype)) {
    return "house";
  }

  const hay = propertyHaystack(propertyType, propertySubtype);
  if (!hay) return "other";

  if (/\b(condo|condominium|apartment)\b/.test(hay)) return "condo";
  if (/\b(townhouse|town[\s_]?house|townhome|town[\s_]?home|villa)\b/.test(hay)) return "townhouse";
  if (/\b(multi[\s_]?family|duplex|triplex|fourplex)\b/.test(hay)) return "multi_family";
  if (/\b(land|lot)\b/.test(hay) && !/\b(single|house|residence)\b/.test(hay)) return "land";
  if (hasSfhSignal(propertyType, propertySubtype) || /\b(house|home)\b/.test(hay)) return "house";
  if (residentialLeaseShouldBeHouse(propertyType, propertySubtype)) return "house";

  return "other";
}
