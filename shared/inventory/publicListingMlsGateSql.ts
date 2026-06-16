/**
 * SQL mirror of passesPublicListingMlsGate — keep in sync with publicListingPublication.ts.
 */
import { sql, type SQL } from "drizzle-orm";
import { inventoryListings } from "../schema";

const lc = inventoryListings.listingCompliance;

/** MLS internet display + attribution + matchable status — shared by diagnostics and sitemap. */
export function publicListingMlsGateSql(): SQL {
  return sql`
    ${inventoryListings.status} in ('active', 'coming_soon')
    and coalesce(${lc}->>'mlgCanView', '') != 'false'
    and coalesce(${lc}->>'internetEntireListingDisplay', '') != 'false'
    and coalesce(${lc}->>'internetDisplay', '') != 'false'
    and (
      (${lc}->>'internetEntireListingDisplay')::text = 'true'
      or (${lc}->>'internetDisplay')::text = 'true'
      or (
        (${lc}->>'provider') = 'mls_grid'
        and (${lc}->>'mlgCanView')::text = 'true'
      )
    )
    and (
      coalesce(${lc}->>'listOfficeName', '') != ''
      or coalesce(${lc}->>'listAgentName', '') != ''
    )
    and coalesce(${lc}->>'mlsSourceName', '') != ''
    and coalesce(${lc}->>'mlsListingId', '') != ''
  `;
}

/** Listings missing office/agent, MLS source name, or MLS listing id. */
export function publicListingMissingAttributionSql(): SQL {
  return sql`(
    (
      coalesce(${lc}->>'listOfficeName', '') = ''
      and coalesce(${lc}->>'listAgentName', '') = ''
    )
    or coalesce(${lc}->>'mlsSourceName', '') = ''
    or coalesce(${lc}->>'mlsListingId', '') = ''
  )`;
}
