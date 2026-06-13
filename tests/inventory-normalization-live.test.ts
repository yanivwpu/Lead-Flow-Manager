/**
 * Live DB inventory normalization regression — requires DATABASE_URL.
 * Run: npx tsx tests/inventory-normalization-live.test.ts
 */
import "dotenv/config";
import { sql, eq, and, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { inventoryListings } from "../shared/schema";
import { MATCHABLE_INVENTORY_STATUSES } from "../shared/inventory/inventoryListingSchema";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import {
  auditBuySearchMatchFunnel,
  countQualifyingInventoryMatches,
  extractBuyerMatchCriteria,
  normalizeListingPropertyType,
} from "../shared/inventory/inventoryMatchScoring";
import { inventoryListingToMatchInput } from "../server/inventory/inventoryMatchingService";
import {
  fetchActiveListingsForMatching,
  resolveMatchingListingLimitForUser,
} from "../server/inventory/inventoryDb";
import {
  backfillStoredListingNormalizationForUser,
  countListingNormalizationSummary,
} from "../server/inventory/inventoryNormalizationBackfill";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MSG_RELAXED =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with or without pool at least 3 bedrooms";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("inventory-normalization-live.test.ts: SKIP (no DATABASE_URL)");
    return;
  }

  const [topUser] = await db
    .select({ userId: inventoryListings.userId, count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .groupBy(inventoryListings.userId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  assert(!!topUser?.userId, "need inventory user");
  const userId = topUser!.userId;

  await backfillStoredListingNormalizationForUser(userId, { activeOnly: true });

  const summary = await countListingNormalizationSummary(userId);
  assert(summary.total > 100, `expected substantial inventory (got ${summary.total})`);
  assert(summary.sale > summary.rent, `more sale than rent (sale=${summary.sale} rent=${summary.rent})`);
  assert(summary.house > 50, `expected SFH rows (got ${summary.house})`);

  assert(
    normalizeListingPropertyType("Townhouse", "Townhouse") === "townhouse",
    "townhouse never house",
  );
  assert(
    normalizeListingPropertyType("Townhome", null) === "townhouse",
    "townhome never house",
  );
  assert(
    normalizeListingPropertyType("Residential", "Single Family Residence") === "house",
    "SFR maps house",
  );

  const limit = await resolveMatchingListingLimitForUser(userId);
  const rows = await fetchActiveListingsForMatching(userId, limit);
  const inputs = rows.map(inventoryListingToMatchInput);

  const patch = heuristicPatchFromInboundText(MSG_RELAXED);
  const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
    replaceArrayFields: parseBuyerSearchCommand(MSG_RELAXED, emptyBuyerPreferenceProfile()).replaceArrayFields,
  });
  const criteria = extractBuyerMatchCriteria(profile);
  assert(criteria.hardRequirePool === false, "with or without pool relaxes pool gate");

  const qualifying = countQualifyingInventoryMatches(inputs, criteria);
  assert(qualifying > 10, `relaxed Pompano SFH should exceed 10 (got ${qualifying})`);

  const funnel = auditBuySearchMatchFunnel(inputs, criteria, { rankLimit: 10, sampleLimit: 5 });
  const saleStep = funnel.steps.find((s) => s.label.includes("sale only"));
  assert((saleStep?.count ?? 0) > qualifying, "sale funnel step includes more than final matches");

  const pompanoRows = await db
    .select({
      propertyType: inventoryListings.propertyType,
      propertySubtype: inventoryListings.propertySubtype,
    })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, userId),
        inArray(inventoryListings.status, [...MATCHABLE_INVENTORY_STATUSES]),
        sql`${inventoryListings.city} ilike '%Pompano%'`,
      ),
    )
    .limit(500);

  for (const row of pompanoRows) {
    const t = normalizeListingPropertyType(row.propertyType, row.propertySubtype);
    if (/\btown/i.test(String(row.propertySubtype ?? row.propertyType ?? ""))) {
      assert(t !== "house", `town property must not be house: ${row.propertySubtype}`);
    }
  }

  console.log("inventory-normalization-live.test.ts: OK", {
    summary,
    qualifying,
    saleStep: saleStep?.count,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
