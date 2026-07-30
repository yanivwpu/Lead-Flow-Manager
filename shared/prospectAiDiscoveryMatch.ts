/**
 * Layered identity matching for Prospect AI discovery (in-run + workspace).
 * Never merge on name-only similarity.
 */

import {
  businessEmailDomain,
  extractCityFromAddress,
  extractStreetKey,
  normalizeBusinessName,
  normalizePhoneDigits,
  normalizeWebsiteDomain,
} from "./prospectAiDiscoveryQuality";

export type ProspectAiMatchType =
  | "place_id"
  | "website_domain"
  | "phone"
  | "business_email_domain"
  | "name_street"
  | "name_city_phone"
  | "name_city_domain";

export type ProspectAiMatchConfidence = "exact" | "high" | "likely";

export type ProspectAiIdentityMatch = {
  matchType: ProspectAiMatchType;
  confidence: ProspectAiMatchConfidence;
  reason: string;
  /** Collapse automatically only for exact/high. */
  autoCollapse: boolean;
};

export type ProspectAiIdentityKeys = {
  placeId: string | null;
  websiteDomain: string | null;
  phone: string | null;
  businessEmailDomain: string | null;
  name: string;
  street: string | null;
  city: string | null;
  nameStreet: string | null;
  nameCityPhone: string | null;
  nameCityDomain: string | null;
};

export function buildIdentityKeys(input: {
  name?: string | null;
  providerPlaceId?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}): ProspectAiIdentityKeys {
  const placeId = String(input.providerPlaceId || "").trim() || null;
  const websiteDomain = normalizeWebsiteDomain(input.website);
  const phone = normalizePhoneDigits(input.phone);
  const emailDomain = businessEmailDomain(input.email);
  const name = normalizeBusinessName(input.name);
  const street = extractStreetKey(input.address);
  const city = extractCityFromAddress(input.address);

  const nameStreet = name && street ? `${name}|${street}` : null;
  const nameCityPhone = name && city && phone ? `${name}|${city}|${phone}` : null;
  const nameCityDomain =
    name && city && websiteDomain ? `${name}|${city}|${websiteDomain}` : null;

  return {
    placeId,
    websiteDomain,
    phone,
    businessEmailDomain: emailDomain,
    name,
    street,
    city,
    nameStreet,
    nameCityPhone,
    nameCityDomain,
  };
}

/**
 * Detect franchise / multi-branch / agent-under-brokerage patterns:
 * same brand name + different street → treat as distinct (do not auto-collapse).
 */
export function looksLikeDistinctBranchOrAgent(
  a: ProspectAiIdentityKeys,
  b: ProspectAiIdentityKeys,
): boolean {
  if (!a.name || !b.name || a.name !== b.name) return false;
  // Different streets with same brand → distinct locations
  if (a.street && b.street && a.street !== b.street) return true;
  // Same phone+domain but different street already covered; different cities
  if (a.city && b.city && a.city !== b.city && a.street && b.street && a.street !== b.street) {
    return true;
  }
  return false;
}

export function classifyIdentityOverlap(
  a: ProspectAiIdentityKeys,
  b: ProspectAiIdentityKeys,
): ProspectAiIdentityMatch | null {
  if (a.placeId && b.placeId && a.placeId === b.placeId) {
    return {
      matchType: "place_id",
      confidence: "exact",
      reason: "Same Google place ID",
      autoCollapse: true,
    };
  }

  // Strong identity keys first — not blocked by franchise/branch heuristics.
  if (a.websiteDomain && b.websiteDomain && a.websiteDomain === b.websiteDomain) {
    if (a.phone && b.phone && a.phone === b.phone) {
      return {
        matchType: "website_domain",
        confidence: "exact",
        reason: "Same website domain and phone",
        autoCollapse: true,
      };
    }
    if (a.street && b.street && a.street === b.street) {
      return {
        matchType: "website_domain",
        confidence: "high",
        reason: "Same website domain and street address",
        autoCollapse: true,
      };
    }
  }

  if (
    a.businessEmailDomain &&
    b.businessEmailDomain &&
    a.businessEmailDomain === b.businessEmailDomain &&
    a.name &&
    b.name &&
    a.name === b.name
  ) {
    return {
      matchType: "business_email_domain",
      confidence: "high",
      reason: "Same business email domain and name",
      autoCollapse: true,
    };
  }

  // Same brand + different street → keep separate (agents / franchise branches).
  if (looksLikeDistinctBranchOrAgent(a, b)) {
    return null;
  }

  if (a.websiteDomain && b.websiteDomain && a.websiteDomain === b.websiteDomain) {
    if (a.name && b.name && a.name === b.name && a.city && b.city && a.city === b.city) {
      return {
        matchType: "name_city_domain",
        confidence: "high",
        reason: "Same name, city, and website domain",
        autoCollapse: true,
      };
    }
    return {
      matchType: "website_domain",
      confidence: "likely",
      reason: "Same website domain (possible multi-location brand)",
      autoCollapse: false,
    };
  }

  if (a.phone && b.phone && a.phone === b.phone) {
    if (a.name && b.name && a.name === b.name) {
      return {
        matchType: "phone",
        confidence: "exact",
        reason: "Same phone and business name",
        autoCollapse: true,
      };
    }
    return {
      matchType: "phone",
      confidence: "likely",
      reason: "Same phone (possible shared tracking number)",
      autoCollapse: false,
    };
  }

  if (a.nameStreet && b.nameStreet && a.nameStreet === b.nameStreet) {
    return {
      matchType: "name_street",
      confidence: "exact",
      reason: "Same normalized name and street address",
      autoCollapse: true,
    };
  }

  if (a.nameCityPhone && b.nameCityPhone && a.nameCityPhone === b.nameCityPhone) {
    return {
      matchType: "name_city_phone",
      confidence: "high",
      reason: "Same name, city, and phone",
      autoCollapse: true,
    };
  }

  if (a.nameCityDomain && b.nameCityDomain && a.nameCityDomain === b.nameCityDomain) {
    return {
      matchType: "name_city_domain",
      confidence: "high",
      reason: "Same name, city, and website domain",
      autoCollapse: true,
    };
  }

  return null;
}
