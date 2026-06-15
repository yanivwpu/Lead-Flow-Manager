/**
 * 100+ realistic buyer/renter search scenarios — command + merge validation.
 * Run: npx tsx tests/buyer-search-scenario-matrix.test.ts
 */
import {
  parseBuyerSearchCommand,
  type BuyerSearchCommandKind,
} from "../shared/buyerSearchCommand";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import {
  emptyBuyerPreferenceProfile,
  type BuyerPreferenceProfile,
} from "../shared/buyerPreferenceSchema";
import { SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE } from "../shared/buyerPreferencePropertyTypeRelax";
import { resolveMatchingBudgetBounds } from "../shared/buyerPreferenceBudget";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";

type Tx = "buy" | "rent";

type ScenarioExpect = {
  commandKind: BuyerSearchCommandKind;
  skipProfileUpdate?: boolean;
  clearUnmentionedHardGates?: boolean;
  transactionType?: Tx | null;
  priceMin?: number | null;
  priceMax?: number | null;
  bedsMin?: number | null;
  bedsMax?: number | null;
  bathsMin?: number | null;
  propertyTypes?: string[] | null;
  /** true = must have areas; false = must be empty; omit = don't check */
  areasPresent?: boolean;
  pool?: boolean | null;
  hardRequirePool?: boolean;
  geoConstraints?: boolean;
  merge?: boolean;
  stalePoolCleared?: boolean;
  staleBedsCleared?: boolean;
  staleSaleBudgetCleared?: boolean;
  staleAreasCleared?: boolean;
  custom?: (ctx: ScenarioContext) => void;
};

type Scenario = {
  name: string;
  phrase: string;
  prior?: BuyerPreferenceProfile;
  expect: ScenarioExpect;
};

type ScenarioContext = {
  scenario: Scenario;
  cmd: ReturnType<typeof parseBuyerSearchCommand>;
  merged: BuyerPreferenceProfile;
  criteria: ReturnType<typeof extractBuyerMatchCriteria>;
  budget: ReturnType<typeof resolveMatchingBudgetBounds>;
};

const now = new Date().toISOString();
const inf = <T>(value: T, evidence = "test") => ({
  value,
  source: "inferred" as const,
  confidence: 0.9,
  updatedAt: now,
  evidence,
});

function profile(partial: Parameters<typeof mergeBuyerPreferenceProfile>[1]): BuyerPreferenceProfile {
  return mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), partial);
}

const buyPoolPompano = profile({
  transactionIntent: inf("buy", "buy intent in message"),
  priceMax: inf(899_000, "up to budget in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area"),
  pool: inf(true, "pool required in message"),
  bedsMin: inf(3, "beds in message"),
});

const buy500kHouse = profile({
  transactionIntent: inf("buy", "buy intent in message"),
  priceMax: inf(500_000, "up to budget in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area"),
  pool: inf(true, "pool required in message"),
});

const relaxedRent = profile({
  transactionIntent: inf("rent", "rent intent in message"),
  propertyTypes: inf(
    ["house", "condo", "townhouse", "multi_family"],
    SHOW_ME_ALL_PROPERTY_RELAX_EVIDENCE,
  ),
  targetAreas: inf(["Pompano"], "area in message"),
  bedsMin: inf(3, "beds in message"),
  bathsMin: inf(2, "baths in message"),
  priceMin: inf(3000, "budget range in message"),
  priceMax: inf(3400, "budget range in message"),
});

const rentPompanoSfh = profile({
  transactionIntent: inf("rent", "rent intent in message"),
  priceMax: inf(4000, "monthly budget in message"),
  bedsMin: inf(3, "beds in message"),
  bedsMax: inf(5, "beds in message"),
  bathsMin: inf(2, "baths in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area in message"),
});

const rent850kBuy = profile({
  transactionIntent: inf("buy", "buy intent in message"),
  priceMax: inf(850_000, "up to budget in message"),
  propertyTypes: inf(["house"], "sfh"),
  targetAreas: inf(["Pompano Beach"], "area"),
  pool: inf(true, "pool required in message"),
});

function eqArr(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const aa = (a ?? []).slice().sort().join(",");
  const bb = (b ?? []).slice().sort().join(",");
  return aa === bb;
}

function snapshot(ctx: ScenarioContext) {
  const { cmd, merged, criteria, budget } = ctx;
  return {
    commandKind: cmd.kind,
    skipProfileUpdate: cmd.skipProfileUpdate,
    clearUnmentionedHardGates: cmd.clearUnmentionedHardGates ?? false,
    transactionType: merged.transactionIntent?.value ?? null,
    priceMin: budget.priceMin,
    priceMax: budget.priceMax,
    bedsMin: merged.bedsMin?.value ?? null,
    bedsMax: merged.bedsMax?.value ?? null,
    bathsMin: merged.bathsMin?.value ?? null,
    propertyTypes: criteria.propertyTypes,
    areas: criteria.areas,
    pool: merged.pool?.value ?? null,
    hardRequirePool: criteria.hardRequirePool,
    geoConstraints: (merged.geoConstraints?.value?.length ?? 0) > 0,
  };
}

function runScenario(scenario: Scenario): { ok: boolean; expected: Record<string, unknown>; actual: Record<string, unknown>; error?: string } {
  const prior = scenario.prior ?? emptyBuyerPreferenceProfile();
  const cmd = parseBuyerSearchCommand(scenario.phrase, prior);
  const shouldMerge =
    scenario.expect.merge !== false &&
    !cmd.skipProfileUpdate &&
    Object.keys(cmd.patch).length > 0;

  const merged = shouldMerge
    ? mergeBuyerPreferenceProfile(prior, cmd.patch, undefined, {
        replaceArrayFields: cmd.replaceArrayFields,
        clearUnmentionedHardGates: cmd.clearUnmentionedHardGates,
        currentMessagePatch: cmd.clearUnmentionedHardGates ? cmd.patch : undefined,
      })
    : prior;

  const ctx: ScenarioContext = {
    scenario,
    cmd,
    merged,
    criteria: extractBuyerMatchCriteria(merged),
    budget: resolveMatchingBudgetBounds(merged),
  };
  const actual = snapshot(ctx);
  const exp = scenario.expect;
  const expected: Record<string, unknown> = { commandKind: exp.commandKind };

  try {
    if (actual.commandKind !== exp.commandKind) {
      throw new Error(`commandKind: expected ${exp.commandKind}, got ${actual.commandKind}`);
    }
    if (exp.skipProfileUpdate != null && actual.skipProfileUpdate !== exp.skipProfileUpdate) {
      throw new Error(`skipProfileUpdate: expected ${exp.skipProfileUpdate}, got ${actual.skipProfileUpdate}`);
    }
    if (exp.clearUnmentionedHardGates != null && actual.clearUnmentionedHardGates !== exp.clearUnmentionedHardGates) {
      throw new Error(
        `clearUnmentionedHardGates: expected ${exp.clearUnmentionedHardGates}, got ${actual.clearUnmentionedHardGates}`,
      );
    }
    if (exp.transactionType !== undefined && actual.transactionType !== exp.transactionType) {
      throw new Error(`transactionType: expected ${exp.transactionType}, got ${actual.transactionType}`);
    }
    if (exp.priceMin !== undefined && actual.priceMin !== exp.priceMin) {
      throw new Error(`priceMin: expected ${exp.priceMin}, got ${actual.priceMin}`);
    }
    if (exp.priceMax !== undefined && actual.priceMax !== exp.priceMax) {
      throw new Error(`priceMax: expected ${exp.priceMax}, got ${actual.priceMax}`);
    }
    if (exp.bedsMin !== undefined && actual.bedsMin !== exp.bedsMin) {
      throw new Error(`bedsMin: expected ${exp.bedsMin}, got ${actual.bedsMin}`);
    }
    if (exp.bedsMax !== undefined && actual.bedsMax !== exp.bedsMax) {
      throw new Error(`bedsMax: expected ${exp.bedsMax}, got ${actual.bedsMax}`);
    }
    if (exp.bathsMin !== undefined && actual.bathsMin !== exp.bathsMin) {
      throw new Error(`bathsMin: expected ${exp.bathsMin}, got ${actual.bathsMin}`);
    }
    if (exp.propertyTypes !== undefined && !eqArr(actual.propertyTypes as string[], exp.propertyTypes)) {
      throw new Error(`propertyTypes: expected ${exp.propertyTypes?.join(",")}, got ${(actual.propertyTypes as string[]).join(",")}`);
    }
    if (exp.areasPresent === true && (actual.areas as string[]).length === 0) {
      throw new Error(`areas: expected non-empty, got []`);
    }
    if (exp.areasPresent === false && (actual.areas as string[]).length > 0) {
      throw new Error(`areas: expected cleared, got ${(actual.areas as string[]).join(", ")}`);
    }
    if (exp.pool !== undefined && actual.pool !== exp.pool) {
      throw new Error(`pool: expected ${exp.pool}, got ${actual.pool}`);
    }
    if (exp.hardRequirePool !== undefined && actual.hardRequirePool !== exp.hardRequirePool) {
      throw new Error(`hardRequirePool: expected ${exp.hardRequirePool}, got ${actual.hardRequirePool}`);
    }
    if (exp.geoConstraints != null && actual.geoConstraints !== exp.geoConstraints) {
      throw new Error(`geoConstraints: expected ${exp.geoConstraints}, got ${actual.geoConstraints}`);
    }
    if (exp.stalePoolCleared && ctx.merged.pool != null) {
      throw new Error(`stalePoolCleared: pool still ${ctx.merged.pool.value}`);
    }
    if (exp.staleBedsCleared && ctx.merged.bedsMin != null) {
      throw new Error(`staleBedsCleared: bedsMin still ${ctx.merged.bedsMin.value}`);
    }
    if (exp.staleAreasCleared && ctx.criteria.areas.length > 0) {
      throw new Error(`staleAreasCleared: areas still ${ctx.criteria.areas.join(", ")}`);
    }
    if (exp.staleSaleBudgetCleared && (actual.priceMax as number | null) != null && (actual.priceMax as number) >= 10_000 && actual.transactionType === "rent") {
      throw new Error(`staleSaleBudgetCleared: sale budget still ${actual.priceMax}`);
    }
    exp.custom?.(ctx);
    return { ok: true, expected, actual };
  } catch (err) {
    Object.assign(expected, {
      transactionType: exp.transactionType,
      priceMin: exp.priceMin,
      priceMax: exp.priceMax,
      bedsMin: exp.bedsMin,
      propertyTypes: exp.propertyTypes,
      areasPresent: exp.areasPresent,
      pool: exp.pool,
      hardRequirePool: exp.hardRequirePool,
      clearUnmentionedHardGates: exp.clearUnmentionedHardGates,
    });
    return {
      ok: false,
      expected,
      actual,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const scenarios: Scenario[] = [
  // ── Buy searches (new) ───────────────────────────────────────────────────
  { name: "buy-sfh-pompano-600k-replacement", phrase: "Show SFH for sale in pompano up to $600k", prior: buyPoolPompano, expect: { commandKind: "new_search", clearUnmentionedHardGates: true, transactionType: "buy", priceMax: 600_000, propertyTypes: ["house"], areasPresent: true, pool: null, hardRequirePool: false, bedsMin: null, stalePoolCleared: true, staleBedsCleared: true } },
  { name: "buy-condo-brickell-500k", phrase: "Looking for a condo in Brickell under $500k", expect: { commandKind: "new_search", priceMax: 500_000, propertyTypes: ["condo"], areasPresent: true } },
  { name: "buy-sfh-boca-1.2m", phrase: "Single family home for sale in Boca up to $1.2m", expect: { commandKind: "new_search", transactionType: "buy", priceMax: 1_200_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "buy-cash-condo-brickell", phrase: "Cash buyer condo Brickell asap", expect: { commandKind: "new_search", transactionType: "buy", propertyTypes: ["condo"], areasPresent: true } },
  { name: "buy-4bed-parkland-900k", phrase: "Pre-approved buyer, 4 bed house in Parkland up to $900k", expect: { commandKind: "new_search", priceMax: 900_000, bedsMin: 4, propertyTypes: ["house"], areasPresent: true } },
  { name: "buy-pool-pompano-850k", phrase: "Homes for sale in Pompano with pool up to $850k", expect: { commandKind: "new_search", transactionType: "buy", priceMax: 850_000, pool: true, hardRequirePool: true, areasPresent: true } },
  { name: "buy-between-parkland-pool", phrase: "Between $400k and $550k in Parkland with pool", expect: { commandKind: "new_search", priceMin: 400_000, priceMax: 550_000, pool: true, hardRequirePool: true, areasPresent: true } },
  { name: "buy-up-to-weston-750k", phrase: "Up to $750k in Weston", expect: { commandKind: "new_search", priceMax: 750_000, areasPresent: true } },
  { name: "buy-townhouse-lighthouse-500k", phrase: "Townhouse for sale in Lighthouse Point up to $500k", expect: { commandKind: "new_search", transactionType: "buy", priceMax: 500_000, propertyTypes: ["townhouse"], areasPresent: true, custom: (c) => { if (c.criteria.propertyTypes.includes("house")) throw new Error("townhouse must not map to house"); } } },
  { name: "buy-waterfront-pompano-900k", phrase: "Waterfront home in Pompano up to $900k", expect: { commandKind: "new_search", priceMax: 900_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "buy-east-federal-pompano", phrase: "East of Federal Hwy in Pompano 3 bed up to $800k", expect: { commandKind: "new_search", priceMax: 800_000, bedsMin: 3, geoConstraints: true, areasPresent: true } },
  { name: "buy-west-federal-deerfield-sfh", phrase: "West of Federal in Deerfield SFH up to $650k", expect: { commandKind: "new_search", priceMax: 650_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "buy-no-pool-explicit-coral", phrase: "don't need a pool 3 bed house in Coral Springs up to $550k", expect: { commandKind: "new_search", priceMax: 550_000, bedsMin: 3, propertyTypes: ["house"], pool: null, hardRequirePool: false, areasPresent: true } },
  { name: "buy-land-broward", phrase: "Looking for land in rural Broward", expect: { commandKind: "new_search", propertyTypes: ["land"] } },
  { name: "buy-multi-family-miami", phrase: "Multi family investment in Miami up to $2m", expect: { commandKind: "new_search", priceMax: 2_000_000, propertyTypes: ["multi_family"], areasPresent: true } },
  { name: "buy-beach-pompano-700k", phrase: "Close to the beach in Pompano buy up to $700k", expect: { commandKind: "new_search", transactionType: "buy", priceMax: 700_000, areasPresent: true } },
  { name: "buy-ocean-view-condo-ftl", phrase: "Ocean view condo Fort Lauderdale up to $600k", expect: { commandKind: "new_search", priceMax: 600_000, propertyTypes: ["condo"] } },
  { name: "buy-sfh-pool-federal", phrase: "Do you have SFH with pool East of Federal Hwy in Pompano?", expect: { commandKind: "new_search", propertyTypes: ["house"], pool: true, geoConstraints: true, areasPresent: true } },
  { name: "buy-low-hoa-weston", phrase: "Low HOA condo in Weston under $400k", expect: { commandKind: "new_search", priceMax: 400_000, propertyTypes: ["condo"] } },
  { name: "buy-3-2-shorthand-empty", phrase: "3/2 in Pompano Beach up to $500k", expect: { commandKind: "new_search", priceMax: 500_000, bedsMin: 3, bathsMin: 2, areasPresent: true } },
  { name: "buy-4-2-shorthand", phrase: "4/2 SFH in Parkland max $950k", expect: { commandKind: "new_search", bedsMin: 4, bathsMin: 2, priceMax: 950_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "buy-must-have-pool-sfh", phrase: "Must have pool SFH in Pompano up to $850k", expect: { commandKind: "new_search", pool: true, hardRequirePool: true, propertyTypes: ["house"], priceMax: 850_000, areasPresent: true } },
  { name: "buy-with-pool-required", phrase: "Need a pool 3 bed house in Boca up to $1.1m", expect: { commandKind: "new_search", pool: true, bedsMin: 3, priceMax: 1_100_000, areasPresent: true } },

  // ── Rent searches (new) ────────────────────────────────────────────────────
  { name: "rent-apartment-miami-2500", phrase: "Apartment for rent in Miami up to $2500", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2500, propertyTypes: ["condo"], areasPresent: true } },
  { name: "rent-3-2-pool-deerfield", phrase: "Rent a 3/2 with pool in Deerfield up to $3200", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 3200, bedsMin: 3, bathsMin: 2, pool: true, hardRequirePool: true, areasPresent: true } },
  { name: "rent-2bed-apartment-pool-2000-2500", phrase: "2 bed apartment with pool between 2000-2500", expect: { commandKind: "new_search", transactionType: "rent", priceMin: 2000, priceMax: 2500, bedsMin: 2, propertyTypes: ["condo"], pool: true, hardRequirePool: true } },
  { name: "rent-pompano-range", phrase: "Rentals in Pompano 3/2 $3000-$3400", expect: { commandKind: "new_search", transactionType: "rent", priceMin: 3000, priceMax: 3400, bedsMin: 3, bathsMin: 2, areasPresent: true } },
  { name: "rent-townhomes-coconut", phrase: "Show me townhomes for rent in Coconut Creek up to $3500", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 3500, areasPresent: true } },
  { name: "rent-multi-oakland", phrase: "Multi family for rent in Oakland Park", expect: { commandKind: "new_search", transactionType: "rent", propertyTypes: ["multi_family"], areasPresent: true } },
  { name: "rent-beach-pompano", phrase: "Close to the beach in Pompano for rent", expect: { commandKind: "new_search", transactionType: "rent", areasPresent: true } },
  { name: "rent-old-pompano-2800", phrase: "Old Pompano area rentals under $2800", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2800 } },
  { name: "rent-pet-friendly-boca", phrase: "Pet friendly rental in Boca 2 bed up to $2500", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2500, bedsMin: 2, areasPresent: true } },
  { name: "rent-annual-lease-miami", phrase: "Annual lease apartment Miami $3000", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 3000, propertyTypes: ["condo"] } },
  { name: "rent-seasonal-pompano", phrase: "Seasonal rental in Pompano Beach 3 months up to $5000", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 5000, areasPresent: true } },
  { name: "rent-2bed-apartment-dollars-empty", phrase: "2 bed apartment anywhere between 2000-2500 dollars", expect: { commandKind: "new_search", transactionType: "rent", priceMin: 2000, priceMax: 2500, bedsMin: 2, propertyTypes: ["condo"], areasPresent: false } },
  { name: "rent-condo-ftl-2200", phrase: "Condo for rent in Fort Lauderdale up to $2200", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2200, propertyTypes: ["condo"], areasPresent: true } },
  { name: "rent-4-2-pompano-range", phrase: "Lease a 4/2 house in Pompano $3500-$4000", expect: { commandKind: "new_search", transactionType: "rent", priceMin: 3500, priceMax: 4000, bedsMin: 4, bathsMin: 2, propertyTypes: ["house"], areasPresent: true } },
  { name: "rent-1bed-anywhere-1800", phrase: "1 bed apartment for rent anywhere up to $1800", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 1800, bedsMin: 1, propertyTypes: ["condo"], areasPresent: false } },
  { name: "rent-furnished-boca", phrase: "Furnished rental in Boca 2/2 up to $3000", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 3000, bedsMin: 2, bathsMin: 2, areasPresent: true } },
  { name: "rent-townhouse-lhp", phrase: "Townhouse for rent in Lighthouse Point up to $4000", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 4000, propertyTypes: ["townhouse"], areasPresent: true } },
  { name: "rent-sfh-hollywood-2800", phrase: "SFH for rent in Hollywood up to $2800", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2800, propertyTypes: ["house"], areasPresent: true } },
  { name: "rent-apartment-wilton-2400", phrase: "Apartment for rent Wilton Manors $2200-$2400", expect: { commandKind: "new_search", transactionType: "rent", priceMin: 2200, priceMax: 2400, propertyTypes: ["condo"] } },
  { name: "rent-3bed-coral-3000", phrase: "3 bedroom for rent in Coral Springs max $3000", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 3000, bedsMin: 3, areasPresent: true } },
  { name: "rent-per-month-pompano", phrase: "For rent in Pompano 2/2 $2500 per month", expect: { commandKind: "new_search", transactionType: "rent", priceMax: 2500, bedsMin: 2, bathsMin: 2, areasPresent: true } },

  // ── Buy → rent pivot ───────────────────────────────────────────────────────
  { name: "pivot-buy-to-rent-friend-apartment", phrase: "Actually I also looking for 2 bed apartment for my friend anywhere between 2000-2500 dollars", prior: buy500kHouse, expect: { commandKind: "transaction_pivot", clearUnmentionedHardGates: true, transactionType: "rent", priceMin: 2000, priceMax: 2500, bedsMin: 2, propertyTypes: ["condo"], areasPresent: false, pool: null, hardRequirePool: false, stalePoolCleared: true, staleAreasCleared: true, staleSaleBudgetCleared: true } },
  { name: "pivot-buy-to-rent-switch-condo", phrase: "Switching to rent — 2 bed condo in Miami Beach $2500-$3000", prior: profile({ transactionIntent: inf("buy", "buy intent in message") }), expect: { commandKind: "transaction_pivot", transactionType: "rent", priceMin: 2500, priceMax: 3000, bedsMin: 2, propertyTypes: ["condo"], areasPresent: true } },
  { name: "pivot-buy-to-rent-instead-pompano", phrase: "Actually looking to rent a 2/2 in Pompano up to $2800", prior: buy500kHouse, expect: { commandKind: "transaction_pivot", transactionType: "rent", priceMax: 2800, bedsMin: 2, bathsMin: 2, areasPresent: true, staleSaleBudgetCleared: true } },
  { name: "pivot-buy-to-rent-rentals-instead", phrase: "Can we look at rentals instead 3/2 in Deerfield up to $3000", prior: buyPoolPompano, expect: { commandKind: "transaction_pivot", transactionType: "rent", priceMax: 3000, bedsMin: 3, bathsMin: 2, areasPresent: true } },
  { name: "pivot-buy-to-rent-townhouse", phrase: "Pivot to rent townhouse in Coconut Creek $3200", prior: buy500kHouse, expect: { commandKind: "transaction_pivot", transactionType: "rent", priceMax: 3200, propertyTypes: ["townhouse"], areasPresent: true } },
  { name: "pivot-buy-to-rent-apartment-anywhere", phrase: "Also need apartment for rent anywhere between 1800-2200 dollars", prior: buyPoolPompano, expect: { commandKind: "transaction_pivot", transactionType: "rent", priceMin: 1800, priceMax: 2200, propertyTypes: ["condo"], areasPresent: false } },

  // ── Rent → buy pivot ─────────────────────────────────────────────────────
  { name: "pivot-rent-to-buy-instead-600k", phrase: "Actually I want to buy instead, up to $600k", prior: relaxedRent, expect: { commandKind: "transaction_pivot", transactionType: "buy", priceMax: 600_000, priceMin: null } },
  { name: "pivot-rent-to-buy-beach-850k", phrase: "Homes for sale up to $850k close to the beach", prior: relaxedRent, expect: { commandKind: "transaction_pivot", transactionType: "buy", priceMax: 850_000 } },
  { name: "pivot-rent-to-buy-pompano-pool", phrase: "Homes for sale in Pompano with pool up to $850k", prior: relaxedRent, expect: { commandKind: "transaction_pivot", transactionType: "buy", priceMax: 850_000, pool: true, areasPresent: true } },
  { name: "pivot-rent-to-buy-purchase-sfh", phrase: "I want to purchase now SFH in Pompano up to $750k", prior: relaxedRent, expect: { commandKind: "transaction_pivot", transactionType: "buy", priceMax: 750_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "pivot-rent-to-buy-cash-boca", phrase: "Cash buyer looking for house in Boca up to $900k", prior: relaxedRent, expect: { commandKind: "new_search", clearUnmentionedHardGates: true, transactionType: "buy", priceMax: 900_000, propertyTypes: ["house"], areasPresent: true } },
  { name: "pivot-rent-to-buy-condo-brickell", phrase: "For sale condo in Brickell under $450k", prior: relaxedRent, expect: { commandKind: "transaction_pivot", transactionType: "buy", priceMax: 450_000, propertyTypes: ["condo"], areasPresent: true } },
  {
    name: "pivot-rent-to-buy-sfh-1mil-pool-pompano",
    phrase: "Show me SFH up to $1 mil with pool in pompano",
    prior: rentPompanoSfh,
    expect: {
      commandKind: "transaction_pivot",
      clearUnmentionedHardGates: true,
      transactionType: "buy",
      priceMax: 1_000_000,
      priceMin: null,
      bedsMin: null,
      bedsMax: null,
      bathsMin: null,
      propertyTypes: ["house"],
      areasPresent: true,
      pool: true,
      hardRequirePool: true,
      staleBedsCleared: true,
      custom: (c) => {
        if (c.budget.priceMax !== 1_000_000) throw new Error("matching budget must be $1M sale cap");
        if (c.criteria.transactionIntent !== "buy") throw new Error("matching must use buy intent");
        if (c.criteria.bedsMin != null || c.criteria.bathsMin != null) {
          throw new Error("matching must not inherit rental bed/bath gates");
        }
      },
    },
  },

  // ── Replacement searches ───────────────────────────────────────────────────
  { name: "replacement-pool-optional-600k", phrase: "Show SFH for sale in pompano with or without pool up to $600k", prior: buyPoolPompano, expect: { commandKind: "new_search", clearUnmentionedHardGates: true, transactionType: "buy", priceMax: 600_000, pool: null, hardRequirePool: false, bedsMin: null, stalePoolCleared: true, staleBedsCleared: true } },
  { name: "replacement-also-with-pool-keeps", phrase: "Show SFH for sale in pompano up to $600k also with pool", prior: buyPoolPompano, expect: { commandKind: "narrow_search", clearUnmentionedHardGates: false, transactionType: "buy", priceMax: 600_000, pool: true, hardRequirePool: true, custom: (c) => { if (!c.merged.pool?.value && !c.criteria.hardRequirePool) throw new Error("also with pool should keep pool"); } } },
  { name: "replacement-buy-coral-400k", phrase: "Show me homes for sale in Coral Springs up to $400k", prior: buyPoolPompano, expect: { commandKind: "new_search", clearUnmentionedHardGates: true, transactionType: "buy", priceMax: 400_000, propertyTypes: ["house"], areasPresent: true, pool: null, hardRequirePool: false, bedsMin: null, stalePoolCleared: true, staleBedsCleared: true } },

  // ── Narrow / broaden ─────────────────────────────────────────────────────
  { name: "narrow-sfh-rent-3000", phrase: "Show me SFH for rent in Pompano up to $3000", prior: relaxedRent, expect: { commandKind: "narrow_search", transactionType: "rent", priceMax: 3000, priceMin: null, propertyTypes: ["house"], areasPresent: true } },
  { name: "narrow-condo-pompano", phrase: "Show me condos in Pompano", prior: relaxedRent, expect: { commandKind: "narrow_search", propertyTypes: ["condo"], areasPresent: true } },
  { name: "narrow-sfh-only-5000mo", phrase: "SFH only in Lighthouse Point max $5000/mo", prior: relaxedRent, expect: { commandKind: "narrow_search", transactionType: "rent", propertyTypes: ["house"], custom: (c) => { if (c.cmd.patch.priceMax?.value !== 5000) throw new Error("patch should capture $5000/mo cap"); } } },
  { name: "broaden-show-me-all-3-2", phrase: "Show me all the 3/2 in Pompano between $3000 and $3400", prior: relaxedRent, expect: { commandKind: "broaden_search", transactionType: "rent", priceMin: 3000, priceMax: 3400, bedsMin: 3, bathsMin: 2, areasPresent: true } },
  { name: "broaden-show-me-all-2-2-hollywood", phrase: "Show me all 2/2 under $2000 in Hollywood", expect: { commandKind: "broaden_search", bedsMin: 2, bathsMin: 2, areasPresent: true, propertyTypes: ["house", "condo", "townhouse", "multi_family"] } },
  { name: "broaden-all-rentals-pompano", phrase: "Show me all rentals in Pompano between $2500-$3500", expect: { commandKind: "broaden_search", transactionType: "rent", priceMin: 2500, priceMax: 3500, areasPresent: true } },

  // ── Refinements ──────────────────────────────────────────────────────────
  { name: "refine-3-2-pompano", phrase: "3/2 in Pompano", prior: relaxedRent, expect: { commandKind: "refine_search", bedsMin: 3, bathsMin: 2, transactionType: "rent" } },
  { name: "refine-min-4-beds", phrase: "Minimum 4 beds in Pompano", prior: relaxedRent, expect: { commandKind: "refine_search", bedsMin: 4, transactionType: "rent" } },
  { name: "refine-at-least-3-bed", phrase: "At least 3 bed in Deerfield", prior: relaxedRent, expect: { commandKind: "refine_search", bedsMin: 3, transactionType: "rent" } },

  // ── Corrections ──────────────────────────────────────────────────────────
  { name: "correction-5-beds-too-big-4-2", phrase: "5 beds is too big, show me 4/2", prior: profile({ bedsMin: inf(5), bedsMax: inf(5, "beds correction") }), expect: { commandKind: "correction", bedsMin: 4, bedsMax: 4, bathsMin: 2 } },
  { name: "correction-too-many-3-2", phrase: "Too many bedrooms — show me 3/2 instead", prior: profile({ bedsMin: inf(5) }), expect: { commandKind: "correction", bedsMin: 3, bathsMin: 2 } },
  { name: "correction-4-too-big-3-2", phrase: "4 beds is too big, 3/2 is better", expect: { commandKind: "correction", bedsMin: 3, bathsMin: 2 } },
  { name: "correction-cheaper-500k", phrase: "Too expensive show me something cheaper under $500k", prior: buyPoolPompano, expect: { commandKind: "refine_search", transactionType: "buy", priceMax: 500_000, propertyTypes: ["house"], areasPresent: true, pool: true, custom: (c) => { if ((c.budget.priceMax ?? 0) >= 899_000) throw new Error("should lower budget cap"); if (!c.criteria.areas.some((a) => /pompano/i.test(a))) throw new Error("area should stay Pompano"); } } },

  // ── Follow-up (no profile update) ──────────────────────────────────────────
  { name: "followup-any-more", phrase: "Any more options?", prior: relaxedRent, expect: { commandKind: "followup_request", skipProfileUpdate: true, merge: false, transactionType: "rent" } },
  { name: "followup-what-else", phrase: "What else do you have in Pompano?", prior: relaxedRent, expect: { commandKind: "followup_request", skipProfileUpdate: true, merge: false } },
  { name: "followup-send-more", phrase: "Send me more listings", prior: relaxedRent, expect: { commandKind: "followup_request", skipProfileUpdate: true, merge: false } },
  { name: "followup-other-listings", phrase: "Do you have any other listings?", prior: buyPoolPompano, expect: { commandKind: "followup_request", skipProfileUpdate: true, merge: false } },

  // ── Townhouse ≠ house ─────────────────────────────────────────────────────
  { name: "townhouse-rent-not-house", phrase: "Townhouse for rent in Fort Lauderdale", expect: { commandKind: "new_search", transactionType: "rent", propertyTypes: ["townhouse"], areasPresent: true, custom: (c) => { if (c.criteria.propertyTypes.includes("house")) throw new Error("townhouse ≠ house"); } } },
  { name: "townhome-sale-parkland", phrase: "Townhome for sale in Parkland up to $480k", expect: { commandKind: "new_search", transactionType: "buy", priceMax: 480_000, propertyTypes: ["townhouse"], areasPresent: true } },

  // ── Show me all (property type relax) ──────────────────────────────────────
  { name: "show-me-all-specific-condos", phrase: "Show me all condos in Pompano 2/2", expect: { commandKind: "new_search", propertyTypes: ["condo"], bedsMin: 2, bathsMin: 2, areasPresent: true, custom: (c) => { if (c.cmd.kind === "broaden_search") throw new Error("all condos is specific not broaden"); } } },
];

// ── Generated realistic variations (bulk to 100+) ────────────────────────────
const buyAreas = ["Pompano Beach", "Boca Raton", "Parkland", "Coral Springs", "Deerfield Beach", "Weston", "Hollywood", "Fort Lauderdale"];
const rentAreas = ["Pompano", "Hollywood", "Boca", "Deerfield", "Coconut Creek"];
const buyCaps = [425_000, 525_000, 625_000, 725_000, 825_000];

for (const area of buyAreas) {
  for (const cap of buyCaps.slice(0, 2)) {
    const k = cap / 1000;
    scenarios.push({
      name: `gen-buy-sfh-${area.replace(/\s/g, "-").toLowerCase()}-${k}k`,
      phrase: `SFH for sale in ${area} up to $${k}k`,
      expect: { commandKind: "new_search", transactionType: "buy", priceMax: cap, propertyTypes: ["house"], areasPresent: true },
    });
  }
}

for (const area of rentAreas) {
  for (const cap of [2200, 2600, 3000, 3400]) {
    scenarios.push({
      name: `gen-rent-2bed-${area.replace(/\s/g, "-").toLowerCase()}-${cap}`,
      phrase: `2 bed for rent in ${area} up to $${cap}`,
      expect: { commandKind: "new_search", transactionType: "rent", priceMax: cap, bedsMin: 2, areasPresent: true },
    });
  }
}

for (const beds of [2, 3, 4]) {
  scenarios.push({
    name: `gen-rent-${beds}-2-apartment-dollars`,
    phrase: `${beds}/2 apartment anywhere between ${1800 + beds * 100}-${2200 + beds * 100} dollars`,
    expect: {
      commandKind: "new_search",
      transactionType: "rent",
      priceMin: 1800 + beds * 100,
      priceMax: 2200 + beds * 100,
      bedsMin: beds,
      bathsMin: 2,
      propertyTypes: ["condo"],
      areasPresent: false,
    },
  });
}

for (const cap of [550_000, 650_000, 750_000]) {
  scenarios.push({
    name: `gen-replacement-${cap}`,
    phrase: `Show SFH for sale in pompano up to $${cap / 1000}k`,
    prior: buyPoolPompano,
    expect: {
      commandKind: "new_search",
      clearUnmentionedHardGates: true,
      transactionType: "buy",
      priceMax: cap,
      pool: null,
      bedsMin: null,
      hardRequirePool: false,
      stalePoolCleared: true,
      staleBedsCleared: true,
    },
  });
}

// ── Run matrix ───────────────────────────────────────────────────────────────
const failures: Array<{ name: string; phrase: string; error: string; expected: Record<string, unknown>; actual: Record<string, unknown> }> = [];
let passed = 0;

for (const scenario of scenarios) {
  const result = runScenario(scenario);
  if (result.ok) {
    passed++;
  } else {
    failures.push({
      name: scenario.name,
      phrase: scenario.phrase,
      error: result.error ?? "unknown",
      expected: result.expected,
      actual: result.actual,
    });
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("  BUYER SEARCH SCENARIO MATRIX");
console.log("═══════════════════════════════════════════════════════════");
console.log(`Total scenarios: ${scenarios.length}`);
console.log(`Passed:          ${passed}`);
console.log(`Failed:          ${failures.length}`);

if (failures.length > 0) {
  console.log("\n── Failures ──");
  for (const f of failures) {
    console.log(`\n✗ ${f.name}`);
    console.log(`  phrase: ${f.phrase.slice(0, 100)}${f.phrase.length > 100 ? "…" : ""}`);
    console.log(`  error:  ${f.error}`);
    console.log(`  expected: ${JSON.stringify(f.expected)}`);
    console.log(`  actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}

console.log("\nbuyer-search-scenario-matrix.test.ts: OK");
if (scenarios.length < 100) {
  console.error(`Expected 100+ scenarios, got ${scenarios.length}`);
  process.exit(1);
}
