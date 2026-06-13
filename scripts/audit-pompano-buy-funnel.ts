/**
 * Live DB buy-search funnel audit (same path as findMatchingListingsForContact).
 *
 * Usage:
 *   npx tsx scripts/audit-pompano-buy-funnel.ts --userId <uuid>
 *   npx tsx scripts/audit-pompano-buy-funnel.ts --contact <contactId>
 *   npx tsx scripts/audit-pompano-buy-funnel.ts --userId <uuid> --message "I'm a cash buyer..."
 *
 * Runs two scenarios when --both-messages is set (strict pool 4bd + optional pool 3bd).
 */
import "dotenv/config";
import { eq, ilike, sql, and, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, inventoryListings, inventorySources } from "../shared/schema";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import {
  auditBuySearchMatchFunnel,
  extractBuyerMatchCriteria,
  rankInventoryMatches,
} from "../shared/inventory/inventoryMatchScoring";
import {
  loadPersistedBuyerPreferenceProfile,
  readBuyerPreferenceProfile,
} from "../server/buyerPreferenceService";
import { storage } from "../server/storage";
import {
  countActiveListingsForUser,
  countAllListingsForUser,
  fetchActiveListingsForMatching,
  resolveMatchingListingLimitForUser,
} from "../server/inventory/inventoryDb";
import {
  findMatchingListingsForContact,
  inventoryListingToMatchInput,
} from "../server/inventory/inventoryMatchingService";

const MSG_STRICT =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with pool at least 4 bedrooms";
const MSG_RELAXED =
  "I'm a cash buyer I can buy a home up to $899. Looking for SFH in Pompano with or without pool at least 3 bedrooms";

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function formatPrice(cents: number | null): string {
  if (cents == null) return "—";
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

function profileFromMessage(message: string) {
  const patch = heuristicPatchFromInboundText(message);
  const cmd = parseBuyerSearchCommand(message, emptyBuyerPreferenceProfile());
  const profile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), patch, undefined, {
    replaceArrayFields: cmd.replaceArrayFields,
  });
  return {
    patch,
    profile,
    cmd,
    criteria: extractBuyerMatchCriteria(profile),
    budget: resolveMatchingBudgetBounds(profile),
  };
}

async function resolveUserId(): Promise<{ userId: string; contactId?: string; contactName?: string }> {
  const userIdArg = argValue("--userId");
  if (userIdArg) return { userId: userIdArg };

  const contactId = argValue("--contact");
  const name = argValue("--name");
  if (contactId) {
    const [row] = await db
      .select({ id: contacts.id, userId: contacts.userId, name: contacts.name })
      .from(contacts)
      .where(eq(contacts.id, contactId))
      .limit(1);
    if (!row) throw new Error(`Contact not found: ${contactId}`);
    return { userId: row.userId, contactId: row.id, contactName: row.name ?? undefined };
  }
  if (name) {
    const rows = await db
      .select({ id: contacts.id, userId: contacts.userId, name: contacts.name })
      .from(contacts)
      .where(ilike(contacts.name, `%${name}%`))
      .limit(5);
    if (!rows.length) throw new Error(`No contact matching: ${name}`);
    return { userId: rows[0].userId, contactId: rows[0].id, contactName: rows[0].name ?? undefined };
  }

  const [topUser] = await db
    .select({ userId: inventoryListings.userId, count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .groupBy(inventoryListings.userId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  if (!topUser?.userId) throw new Error("No inventory rows — pass --userId or --contact");
  console.log("(auto-selected userId with most inventory)");
  return { userId: topUser.userId };
}

async function countPompanoSaleInDb(userId: string) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .where(
      and(
        eq(inventoryListings.userId, userId),
        inArray(inventoryListings.status, ["active", "coming_soon"]),
        ilike(inventoryListings.city, "%Pompano%"),
      ),
    );
  return row?.count ?? 0;
}

async function printScenario(
  label: string,
  message: string,
  inputs: ReturnType<typeof inventoryListingToMatchInput>[],
  persistedProfile?: ReturnType<typeof readBuyerPreferenceProfile>,
) {
  console.log(`\n${"=".repeat(72)}`);
  console.log(`SCENARIO: ${label}`);
  console.log("=".repeat(72));
  console.log("Message:", message.slice(0, 120));

  const parsed = profileFromMessage(message);
  console.log("\n--- Parsed patch (heuristic) ---");
  console.log(JSON.stringify(parsed.patch, (k, v) => (v && typeof v === "object" && "value" in v ? v.value : v), 2));
  console.log("Budget bounds:", parsed.budget);
  console.log("hardRequirePool:", parsed.criteria.hardRequirePool);
  console.log("propertyTypes:", parsed.criteria.propertyTypes);
  console.log("bedsMin:", parsed.criteria.bedsMin, "priceMax:", parsed.criteria.priceMax);

  if (persistedProfile) {
    const persistedCriteria = extractBuyerMatchCriteria(persistedProfile);
    console.log("\n--- Persisted contact profile (APP uses this) ---");
    console.log("pool:", persistedProfile.pool?.value, "evidence:", persistedProfile.pool?.evidence);
    console.log("bedsMin:", persistedProfile.bedsMin?.value);
    console.log("priceMax:", persistedProfile.priceMax?.value);
    console.log("propertyTypes:", persistedProfile.propertyTypes?.value);
    console.log("hardRequirePool (persisted):", persistedCriteria.hardRequirePool);
  }

  const funnel = auditBuySearchMatchFunnel(inputs, parsed.criteria, { rankLimit: 10, sampleLimit: 20 });
  console.log("\n--- Funnel (live inventory rows) ---");
  for (const step of funnel.steps) {
    console.log(`  ${String(step.count).padStart(5)}  ${step.label}`);
  }

  console.log("\n--- Data quality (all loaded rows) ---");
  for (const [k, v] of Object.entries(funnel.dataQuality)) {
    console.log(`  ${k}: ${v}`);
  }

  console.log("\n--- Exclusion breakdown (full profile gates) ---");
  const sorted = Object.entries(funnel.exclusionByReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, count] of sorted.slice(0, 15)) {
    console.log(`  ${count}x  ${reason}`);
  }

  const ranked = rankInventoryMatches(inputs, parsed.criteria, 10);
  console.log(`\n--- Top matches (${ranked.length}) ---`);
  for (const m of ranked.slice(0, 10)) {
    const l = m.listing;
    console.log(
      `  score=${m.score} ${m.providerListingId} | ${l.city} | ${formatPrice(l.priceCents)} | ` +
        `${l.beds ?? "?"}bd | ${l.propertyType ?? "—"} | ${m.reasons.slice(0, 2).join("; ")}`,
    );
  }

  console.log(`\n--- Excluded samples (up to 20) ---`);
  for (const s of funnel.excludedSamples) {
    console.log(
      `  ${s.providerListingId} | ${s.address ?? "—"} | ${s.city ?? "—"} | ${formatPrice(s.priceCents)} | ` +
        `${s.beds ?? "?"}bd | raw=${s.propertyType ?? "—"} resolved=${s.resolvedType ?? "—"} | ` +
        `pool=${s.poolDetected ? "yes" : "no"} | ${s.matched ? `MATCH ${s.score}` : s.exclusionReason ?? "?"}`,
    );
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { userId, contactId, contactName } = await resolveUserId();
  const customMessage = argValue("--message");
  const bothMessages = process.argv.includes("--both-messages") || !customMessage;

  const totalListings = await countAllListingsForUser(userId);
  const activeCount = await countActiveListingsForUser(userId);
  const pompanoActive = await countPompanoSaleInDb(userId);
  const matchingLimit = await resolveMatchingListingLimitForUser(userId);
  const rows = await fetchActiveListingsForMatching(userId, matchingLimit);
  const inputs = rows.map(inventoryListingToMatchInput);

  const sources = await db
    .select({ provider: inventorySources.provider, count: sql<number>`count(*)::int` })
    .from(inventoryListings)
    .innerJoin(inventorySources, eq(inventoryListings.sourceId, inventorySources.id))
    .where(eq(inventoryListings.userId, userId))
    .groupBy(inventorySources.provider);

  console.log("\n=== LIVE Pompano buy funnel audit ===\n");
  console.log("userId:", userId);
  if (contactId) console.log("contact:", contactId, contactName ?? "");
  console.log("Total listings (all statuses):", totalListings);
  console.log("Active/coming_soon:", activeCount);
  console.log("Active in Pompano (city ilike):", pompanoActive);
  console.log("Matching fetch limit:", matchingLimit);
  console.log("Rows loaded for scoring:", inputs.length);
  console.log("Sources:", sources.map((s) => `${s.provider}=${s.count}`).join(", ") || "(none)");

  let persistedProfile: ReturnType<typeof readBuyerPreferenceProfile> | undefined;
  let apiMatchCount: number | undefined;
  if (contactId) {
    const contact = await storage.getContact(contactId);
    persistedProfile =
      (await loadPersistedBuyerPreferenceProfile(contactId)) ??
      (contact ? readBuyerPreferenceProfile(contact) : undefined);
    const api = await findMatchingListingsForContact(contactId, userId);
    apiMatchCount = api.matchCount;
    console.log("\n--- App API findMatchingListingsForContact ---");
    console.log("eligible:", api.eligible, "reason:", api.reason);
    console.log("matchCount:", api.matchCount);
    console.log("inventoryCount:", api.inventoryCount);
    console.log("listingsScored (diagnostics):", api.diagnostics?.listingsScored);
    if (api.diagnostics?.exclusionSummary) console.log("exclusionSummary:", api.diagnostics.exclusionSummary);
    if (api.diagnostics?.activeFilterSummary) console.log("activeFilterSummary:", api.diagnostics.activeFilterSummary);
    if (apiMatchCount !== undefined) {
      console.log("(Compare API matchCount to funnel final ranked matches below)");
    }
  }

  if (bothMessages) {
    await printScenario("Strict: pool + 4+ beds", MSG_STRICT, inputs, persistedProfile);
    await printScenario("Relaxed: pool optional + 3+ beds", MSG_RELAXED, inputs, persistedProfile);

    console.log(`\n${"=".repeat(72)}`);
    console.log("SCENARIO: Two-message merge (msg1 strict → msg2 relaxed) — APP profile path");
    console.log("=".repeat(72));
    let merged = emptyBuyerPreferenceProfile();
    for (const message of [MSG_STRICT, MSG_RELAXED]) {
      const patch = heuristicPatchFromInboundText(message);
      const cmd = parseBuyerSearchCommand(message, merged);
      merged = mergeBuyerPreferenceProfile(merged, patch, undefined, {
        replaceArrayFields: cmd.replaceArrayFields,
      });
    }
    const mergedCriteria = extractBuyerMatchCriteria(merged);
    console.log("Merged profile pool:", merged.pool?.value ?? "(cleared)");
    console.log("Merged bedsMin:", merged.bedsMin?.value);
    console.log("Merged priceMax:", merged.priceMax?.value);
    console.log("hardRequirePool:", mergedCriteria.hardRequirePool);
    const mergedFunnel = auditBuySearchMatchFunnel(inputs, mergedCriteria, {
      rankLimit: 10,
      sampleLimit: 20,
    });
    console.log("\n--- Funnel (two-message merged profile) ---");
    for (const step of mergedFunnel.steps) {
      console.log(`  ${String(step.count).padStart(5)}  ${step.label}`);
    }
    if (persistedProfile) {
      const persistedCriteria = extractBuyerMatchCriteria(persistedProfile);
      console.log("\n--- Persisted vs merged ---");
      console.log(
        "persisted pool:",
        persistedProfile.pool?.value ?? "(cleared)",
        "| merged pool:",
        merged.pool?.value ?? "(cleared)",
      );
      console.log(
        "persisted hardRequirePool:",
        persistedCriteria.hardRequirePool,
        "| merged:",
        mergedCriteria.hardRequirePool,
      );
      console.log(
        "persisted priceMax:",
        persistedProfile.priceMax?.value,
        "| merged:",
        merged.priceMax?.value,
      );
    }
  } else if (customMessage) {
    await printScenario("Custom message", customMessage, inputs, persistedProfile);
  }

  console.log("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
