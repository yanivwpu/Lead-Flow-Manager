/**
 * SQL prefilter for buyer matching pool — coarse mirror of passesMatchingPoolHardGates.
 * Refined in-memory after fetch; keep patterns aligned with listingTransactionIntent + area gates.
 */
import { sql, type SQL } from "drizzle-orm";
import { inventoryListings } from "../schema";
import type { BuyerMatchCriteria } from "./inventoryMatchScoring";

const ld = inventoryListings.listingDetails;
const pt = inventoryListings.propertyType;
const ps = inventoryListings.propertySubtype;
const pc = inventoryListings.priceCents;

function rentSignalsSql(): SQL {
  return sql`(
    coalesce(${ld}->>'listingTransactionType', '') = 'rent'
    OR lower(coalesce(${pt}, '')) ~* '(rent|rental|lease|residential[[:space:]_]+lease)'
    OR lower(coalesce(${ps}, '')) ~* '(rent|rental|lease|apartment)'
  )`;
}

function monthlyRentPriceSql(): SQL {
  return sql`(
    ${pc} is not null
    AND ${pc} >= 40000
    AND ${pc} <= 5000000
    AND coalesce(${ld}->>'listingTransactionType', '') IS DISTINCT FROM 'sale'
    AND lower(coalesce(${pt}, '')) !~* '(for[[:space:]_]+sale|sale[[:space:]_]+only)'
  )`;
}

function matchingPoolRentIntentSql(): SQL {
  return sql`(
    ${rentSignalsSql()}
    OR ${monthlyRentPriceSql()}
  )`;
}

function matchingPoolBuyIntentSql(criteria: BuyerMatchCriteria): SQL {
  const rentLike = sql`(${rentSignalsSql()} OR ${monthlyRentPriceSql()})`;
  if (criteria.priceMax != null && criteria.priceMax >= 150_000) {
    const monthlyRentScale = sql`(
      ${pc} is not null
      AND ${pc} > 0
      AND ${pc} < 5000000
      AND coalesce(${ld}->>'listingTransactionType', '') IS DISTINCT FROM 'sale'
    )`;
    return sql`NOT (${rentLike}) AND NOT (${monthlyRentScale})`;
  }
  return sql`NOT (${rentLike})`;
}

function matchingPoolAreaSql(areas: string[]): SQL | null {
  if (areas.length === 0) return null;
  const clauses = areas
    .map((area) => area.trim().toLowerCase())
    .filter(Boolean)
    .map((norm) => {
      const like = `%${norm.replace(/\s+/g, "%")}%`;
      return sql`(
        lower(trim(coalesce(${inventoryListings.city}, ''))) = ${norm}
        OR lower(coalesce(${inventoryListings.city}, '')) LIKE ${like}
        OR ${norm} LIKE '%' || lower(trim(coalesce(${inventoryListings.city}, ''))) || '%'
        OR lower(coalesce(${inventoryListings.addressLine1}, '')) LIKE ${`%${norm}%`}
        OR lower(coalesce(${inventoryListings.addressLine2}, '')) LIKE ${`%${norm}%`}
        OR lower(coalesce(${inventoryListings.zip}, '')) = ${norm}
      )`;
    });
  if (clauses.length === 0) return null;
  return sql`(${sql.join(clauses, sql` OR `)})`;
}

const PROPERTY_TYPE_SQL_PATTERNS: Record<string, string> = {
  condo: "(condo|condominium|apartment)",
  house: "(single[[:space:]_]+family|detached|sfh|\\bhouse\\b)",
  townhouse: "(townhouse|town[[:space:]_]?house|townhome|town[[:space:]_]?home)",
  villa: "\\bvilla\\b",
  multi_family: "(multi[[:space:]_]?family|duplex|triplex|fourplex)",
  land: "\\bland\\b",
  residential_lease: "(residential[[:space:]_]+lease|lease)",
};

function matchingPoolPropertyTypesSql(types: string[]): SQL | null {
  const normalized = types.map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return null;

  const clauses = normalized.map((type) => {
    const pattern = PROPERTY_TYPE_SQL_PATTERNS[type];
    if (pattern) {
      return sql`(
        lower(coalesce(${pt}, '')) ~* ${pattern}
        OR lower(coalesce(${ps}, '')) ~* ${pattern}
      )`;
    }
    const like = `%${type.replace(/_/g, "%")}%`;
    return sql`(
      lower(coalesce(${pt}, '')) LIKE ${like}
      OR lower(coalesce(${ps}, '')) LIKE ${like}
    )`;
  });

  return sql`(${sql.join(clauses, sql` OR `)})`;
}

/** Coarse SQL conditions derived from buyer profile — applied before synced_at cap. */
export function buildMatchingPoolProfileSqlConditions(criteria: BuyerMatchCriteria): SQL[] {
  const conditions: SQL[] = [];

  if (criteria.transactionIntent === "rent") {
    conditions.push(matchingPoolRentIntentSql());
  } else if (criteria.transactionIntent === "buy") {
    conditions.push(matchingPoolBuyIntentSql(criteria));
  }

  const areaSql = matchingPoolAreaSql(criteria.areas);
  if (areaSql) conditions.push(areaSql);

  if (criteria.priceMax != null) {
    const maxCents = Math.round(criteria.priceMax * 100);
    conditions.push(
      sql`(${pc} IS NULL OR ${pc} <= ${maxCents})`,
    );
  }

  if (criteria.priceMin != null) {
    const minCents = Math.round(criteria.priceMin * 100);
    conditions.push(
      sql`(${pc} IS NULL OR ${pc} >= ${minCents})`,
    );
  }

  const typeSql = matchingPoolPropertyTypesSql(criteria.propertyTypes);
  if (typeSql) conditions.push(typeSql);

  if (criteria.bedsMin != null) {
    conditions.push(sql`(${inventoryListings.beds} IS NULL OR ${inventoryListings.beds} >= ${criteria.bedsMin})`);
  }

  if (criteria.bedsMax != null) {
    conditions.push(sql`(${inventoryListings.beds} IS NULL OR ${inventoryListings.beds} <= ${criteria.bedsMax})`);
  }

  if (criteria.bathsMin != null) {
    conditions.push(
      sql`(${inventoryListings.baths} IS NULL OR ${inventoryListings.baths} >= ${criteria.bathsMin})`,
    );
  }

  if (criteria.sqftMin != null) {
    conditions.push(
      sql`(${inventoryListings.squareFeet} IS NULL OR ${inventoryListings.squareFeet} >= ${criteria.sqftMin})`,
    );
  }

  if (criteria.sqftMax != null) {
    conditions.push(
      sql`(${inventoryListings.squareFeet} IS NULL OR ${inventoryListings.squareFeet} <= ${criteria.sqftMax})`,
    );
  }

  if (criteria.hardRequirePool) {
    conditions.push(sql`(
      coalesce((${ld}->>'pool')::text, '') IN ('true', 't', '1', 'yes')
      OR lower(coalesce(${pt}, '')) ~* 'pool'
      OR lower(coalesce(${ps}, '')) ~* 'pool'
    )`);
  }

  if (criteria.hardRequireWaterfront) {
    conditions.push(sql`(
      coalesce((${ld}->>'waterfront')::text, '') IN ('true', 't', '1', 'yes')
      OR lower(coalesce(${pt}, '')) ~* 'waterfront'
      OR lower(coalesce(${ps}, '')) ~* 'waterfront'
    )`);
  }

  return conditions;
}
