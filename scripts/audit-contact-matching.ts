/**
 * Full match-funnel audit for a contact (e.g. Susu rental search).
 *
 * Usage:
 *   npx tsx scripts/audit-contact-matching.ts <contactId>
 *   npx tsx scripts/audit-contact-matching.ts --name Susu
 *   npx tsx scripts/audit-contact-matching.ts --name Susu --beds 3 --baths 2 --price-min 3000 --price-max 3400 --area "Pompano Beach"
 */
import "dotenv/config";
import { eq, and, sql, ilike } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, inventoryListings, inventorySources } from "../shared/schema";
import {
  auditInventoryMatchFunnel,
  extractBuyerMatchCriteria,
  MIN_STRONG_MATCH_SCORE,
} from "../shared/inventory/inventoryMatchScoring";
import { listingIsRentalOrLease, listingIsLikelySalePrice } from "../shared/inventory/listingTransactionIntent";
import {
  loadPersistedBuyerPreferenceProfile,
  readBuyerPreferenceProfile,
} from "../server/buyerPreferenceService";
import { storage } from "../server/storage";
import {
  fetchActiveListingsForMatching,
  resolveMatchingListingLimitForUser,
  countActiveListingsForUser,
} from "../server/inventory/inventoryDb";
import {
  findMatchingListingsForContact,
  inventoryListingToMatchInput,
} from "../server/inventory/inventoryMatchingService";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const FLAGS_WITH_VALUE = new Set([
  "--name",
  "--beds",
  "--baths",
  "--price-min",
  "--price-max",
  "--area",
]);

function positionalArgs(): string[] {
  const out: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (FLAGS_WITH_VALUE.has(a)) {
      i += 1;
      continue;
    }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}

const nameQuery = argValue("--name");
const contactIdArg = positionalArgs()[0];
const beds = Number(argValue("--beds") ?? "3");
const baths = Number(argValue("--baths") ?? "2");
const priceMin = Number(argValue("--price-min") ?? "3000");
const priceMax = Number(argValue("--price-max") ?? "3400");
const area = argValue("--area") ?? "Pompano Beach";

function formatPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

async function resolveContact(): Promise<{ id: string; name: string | null; userId: string }> {
  if (contactIdArg) {
    const [row] = await db
      .select({ id: contacts.id, name: contacts.name, userId: contacts.userId })
      .from(contacts)
      .where(eq(contacts.id, contactIdArg))
      .limit(1);
    if (!row) throw new Error(`Contact not found: ${contactIdArg}`);
    return row;
  }
  if (nameQuery) {
    const rows = await db
      .select({ id: contacts.id, name: contacts.name, userId: contacts.userId })
      .from(contacts)
      .where(ilike(contacts.name, `%${nameQuery}%`))
      .limit(10);
    if (rows.length === 0) throw new Error(`No contact matching name: ${nameQuery}`);
    if (rows.length > 1) {
      console.log("Multiple contacts matched — using first. Pass contactId to be explicit:\n");
      for (const r of rows) console.log(`  ${r.id}  ${r.name ?? "(no name)"}`);
      console.log("");
    }
    return rows[0];
  }
  console.error(
    "Usage: npx tsx scripts/audit-contact-matching.ts <contactId>\n" +
      "   or: npx tsx scripts/audit-contact-matching.ts --name Susu",
  );
  process.exit(1);
}

async function countMlsRawShapeRentals(
  userId: string,
  shape: { areas: string[]; bedsMin: number; bathsMin: number; priceMin: number; priceMax: number },
): Promise<number> {
  const areaPatterns = shape.areas.map((a) => `%${a}%`);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .innerJoin(inventorySources, eq(inventoryListings.sourceId, inventorySources.id))
    .where(
      and(
        eq(inventoryListings.userId, userId),
        eq(inventoryListings.status, "active"),
        sql`${inventorySources.provider} in ('bridge_interactive', 'mls', 'reso')`,
        sql`coalesce(${inventoryListings.beds}::numeric, 0) >= ${shape.bedsMin}`,
        sql`coalesce(${inventoryListings.baths}::numeric, 0) >= ${shape.bathsMin}`,
        sql`${inventoryListings.priceCents} >= ${shape.priceMin * 100}`,
        sql`${inventoryListings.priceCents} <= ${shape.priceMax * 100}`,
        sql`(${inventoryListings.city} ilike any (array[${sql.join(
          areaPatterns.map((p) => sql`${p}`),
          sql`, `,
        )}]))`,
      ),
    );
  return row?.count ?? 0;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const contact = await resolveContact();
  const contactRow = await storage.getContact(contact.id);
  const profile =
    (await loadPersistedBuyerPreferenceProfile(contact.id)) ??
    (contactRow ? readBuyerPreferenceProfile(contactRow) : null);
  if (!profile) throw new Error("No buyer preference profile on contact");

  const criteria = extractBuyerMatchCriteria(profile);
  const rawShape = {
    areas: [area],
    bedsMin: beds,
    bathsMin: baths,
    priceMin,
    priceMax,
  };

  const inventoryCount = await countActiveListingsForUser(contact.userId);
  const matchingLimit = await resolveMatchingListingLimitForUser(contact.userId);
  const rows = await fetchActiveListingsForMatching(contact.userId, matchingLimit);
  const inputs = rows.map(inventoryListingToMatchInput);

  const apiResult = await findMatchingListingsForContact(contact.id, contact.userId);
  const audit = auditInventoryMatchFunnel(inputs, criteria, {
    rawShape,
    rankLimit: 10,
    uiPreviewLimit: 5,
    candidateLimit: 20,
  });

  const rentalInInventory = inputs.filter(
    (l) =>
      listingIsRentalOrLease(l) ||
      (!listingIsLikelySalePrice(l.priceCents) && l.priceCents != null && l.priceCents <= 50_000_00),
  ).length;

  let mlsRawShapeCount: number | null = null;
  try {
    mlsRawShapeCount = await countMlsRawShapeRentals(contact.userId, rawShape);
  } catch {
    mlsRawShapeCount = null;
  }

  console.log("\n=== Susu / contact match funnel audit ===\n");
  console.log("Contact:", contact.id, contact.name ?? "(no name)");
  console.log("Workspace userId:", contact.userId);
  console.log("\n--- Customer request (audit raw shape) ---");
  console.log(`  Rent | ${area} | ${beds} bed | ${baths} bath | $${priceMin}–$${priceMax}/mo`);

  console.log("\n--- BuyerPreferenceProfile (persisted) ---");
  console.log(JSON.stringify(profile, null, 2));

  console.log("\n--- Extracted match criteria ---");
  console.log(JSON.stringify(criteria, null, 2));

  console.log("\n--- Funnel counts ---");
  console.log(`  1. Active inventory (DB total):        ${inventoryCount}`);
  console.log(`  2. Loaded for scoring (sync cap):      ${inputs.length} (limit ${matchingLimit})`);
  console.log(`  3. Raw shape (rent+area+bed/bath+$):   ${audit.rawShapeMatches}`);
  console.log(`  4. Pass hard gates (full profile):     ${audit.passHardGates}`);
  console.log(`  5. Pass score threshold (≥${MIN_STRONG_MATCH_SCORE}):     ${audit.passScoreThreshold}`);
  console.log(`  6. API returned (rank limit ${audit.apiRankLimit}):       ${audit.apiReturned}`);
  console.log(`  7. Copilot sidebar preview (limit 5):  ${Math.min(audit.apiReturned, audit.uiSidebarPreviewLimit)} shown`);

  console.log("\n--- Exclusions ---");
  console.log(`  Score threshold only (all inventory):  ${audit.scoreThresholdExcluded}`);
  console.log(`  Hard gates / preferences (all):          ${audit.hardGateExcluded}`);
  console.log(`  From raw shape → preference gates:       ${audit.preferenceExcludedFromRawShape}`);
  console.log(`  From raw shape → low score:              ${audit.scoreExcludedFromRawShape}`);

  console.log("\n--- Beds rule ---");
  console.log(
    `  ${audit.bedsRule === "exact" ? "Exact" : audit.bedsRule === "minimum" ? "Minimum" : audit.bedsRule}` +
      ` (bedsMin=${criteria.bedsMin ?? "—"}, bedsMax=${criteria.bedsMax ?? "—"})`,
  );

  console.log("\n--- LIMIT 5? ---");
  console.log("  API: rankInventoryMatches limit = 10 (not 5)");
  console.log("  UI: MatchingListingsPanel SIDEBAR_PREVIEW_LIMIT = 5 (sidebar only; View all shows full API list)");

  console.log("\n--- MLS vs returned ---");
  console.log(`  Rental-ish rows in scored set:         ${rentalInInventory}`);
  if (mlsRawShapeCount != null) {
    console.log(`  MLS rows matching raw SQL shape:       ${mlsRawShapeCount}`);
  }
  console.log(`  API eligible:                          ${apiResult.eligible} (${apiResult.reason})`);
  console.log(`  API matchCount:                        ${apiResult.matchCount}`);
  console.log(`  Audit passScoreThreshold:              ${audit.passScoreThreshold}`);
  if (apiResult.matchCount !== audit.passScoreThreshold) {
    console.log(
      "  Note: API count may differ if inventory gate blocks the service path in this environment.",
    );
  }

  console.log("\n--- Exclusion breakdown (labeled) ---");
  const sortedReasons = Object.entries(audit.exclusionByReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sortedReasons.slice(0, 15)) {
    console.log(`  ${reason}: ${count}`);
  }

  console.log("\n--- Top 20 candidates (matches + raw-shape near-misses) ---");
  for (const [i, c] of audit.topCandidates.entries()) {
    const status = c.matched ? `MATCH score=${c.score}` : `EXCLUDED: ${c.exclusionReason ?? "?"}`;
    console.log(
      `  ${String(i + 1).padStart(2)}. ${c.providerListingId} | ${c.city ?? "—"} | ` +
        `${formatPrice(c.priceCents)} | ${c.beds ?? "?"}bd/${c.baths ?? "?"}ba | ${c.propertyType ?? "—"} | ${status}`,
    );
  }

  if (apiResult.diagnostics?.exclusionSummary) {
    console.log("\n--- API diagnostics exclusion summary ---");
    console.log(`  ${apiResult.diagnostics.exclusionSummary}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
