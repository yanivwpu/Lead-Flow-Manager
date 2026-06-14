/**
 * E2E replacement search — persist to DB, reload, inventory matching profile.
 * Run: npx tsx tests/buyer-search-replacement-e2e.test.ts
 */
import "dotenv/config";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import {
  applyBuyerSearchCommandToPatch,
  parseBuyerSearchCommand,
} from "../shared/buyerSearchCommand";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { INVENTORY_DIAGNOSTICS_BUILD_MARKER } from "../shared/inventory/inventoryDiagnosticsBuild";
import { buildInventoryMatchDiagnostics } from "../shared/inventory/inventoryMatchDiagnostics";
import { buildPersistedProfileSnapshotForDiagnostics } from "../shared/buyerSearchCommandDebug";
import { storage } from "../server/storage";
import {
  loadPersistedBuyerPreferenceProfile,
  mergeAndPersistBuyerPreferences,
  persistBuyerPreferenceProfile,
  syncBuyerPreferencesForInboundMessage,
} from "../server/buyerPreferenceService";
import { findMatchingListingsForContact } from "../server/inventory/inventoryMatchingService";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const MSG = "Show SFH for sale in pompano up to $600k";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("buyer-search-replacement-e2e.test.ts: SKIP (no DATABASE_URL)");
    return;
  }

  let userId: string | undefined;
  try {
  const user = await storage.createUser({
    email: `replacement-e2e-${Date.now()}@test.com`,
    password: "test123",
    name: "Replacement E2E",
  });
  userId = user.id;

  const contact = await storage.createContact({
    userId: user.id,
    name: "Replacement E2E Contact",
    phone: `+1555${String(Date.now()).slice(-7)}`,
    primaryChannel: "whatsapp",
    customFields: { leadType: "buyer" },
  });

  const now = new Date().toISOString();
  const priorProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
    pool: {
      value: true,
      source: "inferred",
      confidence: 0.9,
      updatedAt: now,
      evidence: "pool required",
    },
    bedsMin: {
      value: 3,
      source: "inferred",
      confidence: 0.88,
      updatedAt: now,
      evidence: "beds in message",
    },
    priceMax: {
      value: 899_000,
      source: "inferred",
      confidence: 0.9,
      updatedAt: now,
      evidence: "up to budget",
    },
    propertyTypes: {
      value: ["house"],
      source: "inferred",
      confidence: 0.9,
      updatedAt: now,
      evidence: "sfh",
    },
    targetAreas: {
      value: ["Pompano Beach"],
      source: "inferred",
      confidence: 0.9,
      updatedAt: now,
      evidence: "area",
    },
    transactionIntent: {
      value: "buy",
      source: "inferred",
      confidence: 0.9,
      updatedAt: now,
      evidence: "buy",
    },
  });

  await persistBuyerPreferenceProfile(contact.id, priorProfile);

  const reloadedPrior = await loadPersistedBuyerPreferenceProfile(contact.id);
  assert(reloadedPrior?.pool?.value === true, "prior profile pool seeded");
  assert(reloadedPrior?.bedsMin?.value === 3, "prior profile bedsMin seeded");

  const freshContact = (await storage.getContact(contact.id))!;
  await syncBuyerPreferencesForInboundMessage({
    contact: freshContact,
    inboundText: MSG,
  });

  const dbProfile = await loadPersistedBuyerPreferenceProfile(contact.id);
  assert(!!dbProfile, "profile reloaded from DB");
  const dbCriteria = extractBuyerMatchCriteria(dbProfile!);

  assert(dbProfile!.pool == null, `DB pool cleared (got ${dbProfile!.pool?.value})`);
  assert(dbProfile!.bedsMin == null, `DB bedsMin cleared (got ${dbProfile!.bedsMin?.value})`);
  assert(dbProfile!.priceMax?.value === 600_000, `DB priceMax 600k (got ${dbProfile!.priceMax?.value})`);
  assert(dbCriteria.hardRequirePool === false, "DB hardRequirePool false");
  assert(
    dbProfile!.propertyTypes?.value?.join() === "house",
    `DB propertyTypes house (got ${dbProfile!.propertyTypes?.value?.join()})`,
  );
  assert(
    dbProfile!.targetAreas?.value?.some((a) => /pompano/i.test(a)) === true,
    "DB areas include Pompano",
  );

  const snap = buildPersistedProfileSnapshotForDiagnostics(dbProfile!, dbCriteria);

  assert(snap.priceMax === 600_000, `matching priceMax 600k (got ${snap.priceMax})`);
  assert(snap.bedsMin == null, `matching bedsMin null (got ${snap.bedsMin})`);
  assert(snap.pool == null, `matching pool null (got ${snap.pool})`);
  assert(snap.hardRequirePool === false, "matching hardRequirePool false");

  const diag = buildInventoryMatchDiagnostics({
    activeInventoryCount: 0,
    listingsScored: 0,
    matchesReturned: 0,
    persistedProfileSnapshot: snap,
  });
  assert(
    diag.debugBuildMarker === INVENTORY_DIAGNOSTICS_BUILD_MARKER,
    `debugBuildMarker present (got ${diag.debugBuildMarker})`,
  );

  const matchResult = await findMatchingListingsForContact(contact.id, user.id);
  if (matchResult.diagnostics?.persistedProfileSnapshot) {
    const apiSnap = matchResult.diagnostics.persistedProfileSnapshot;
    assert(apiSnap.priceMax === 600_000, `API matching priceMax 600k (got ${apiSnap.priceMax})`);
    assert(apiSnap.bedsMin == null, `API matching bedsMin null (got ${apiSnap.bedsMin})`);
    assert(apiSnap.hardRequirePool === false, "API matching hardRequirePool false");
    if (matchResult.diagnostics.debugBuildMarker) {
      assert(
        matchResult.diagnostics.debugBuildMarker === INVENTORY_DIAGNOSTICS_BUILD_MARKER,
        "API debugBuildMarker",
      );
    }
  }

  // Simulate LLM re-adding stale gates from conversation history — must not persist.
  const llmPatch = {
    pool: {
      value: true as const,
      source: "inferred" as const,
      confidence: 0.85,
      updatedAt: now,
      evidence: "pool mentioned earlier in thread",
    },
    bedsMin: {
      value: 3,
      source: "inferred" as const,
      confidence: 0.85,
      updatedAt: now,
      evidence: "beds from earlier message",
    },
    priceMax: {
      value: 600_000,
      source: "inferred" as const,
      confidence: 0.9,
      updatedAt: now,
      evidence: "up to budget in message",
    },
    propertyTypes: {
      value: ["house"] as const,
      source: "inferred" as const,
      confidence: 0.9,
      updatedAt: now,
      evidence: "sfh in message",
    },
    targetAreas: {
      value: ["Pompano Beach"],
      source: "inferred" as const,
      confidence: 0.9,
      updatedAt: now,
      evidence: "area in message",
    },
    transactionIntent: {
      value: "buy" as const,
      source: "inferred" as const,
      confidence: 0.9,
      updatedAt: now,
      evidence: "for sale in message",
    },
  };

  const command = parseBuyerSearchCommand(MSG, dbProfile!);
  applyBuyerSearchCommandToPatch(llmPatch, command);
  assert(llmPatch.pool == null, "LLM patch pool stripped before merge");
  assert(llmPatch.bedsMin == null, "LLM patch bedsMin stripped before merge");

  const contactForLlm = (await storage.getContact(contact.id))!;
  await mergeAndPersistBuyerPreferences(contactForLlm, llmPatch, {
    clearUnmentionedHardGates: command.clearUnmentionedHardGates,
    currentMessagePatch: command.patch,
    replaceArrayFields: command.replaceArrayFields,
    triggerInventoryRefresh: false,
  });

  const afterLlm = await loadPersistedBuyerPreferenceProfile(contact.id);
  const afterLlmCriteria = extractBuyerMatchCriteria(afterLlm!);
  assert(afterLlm!.pool == null, "after simulated LLM: pool still cleared");
  assert(afterLlm!.bedsMin == null, "after simulated LLM: bedsMin still cleared");
  assert(afterLlmCriteria.hardRequirePool === false, "after simulated LLM: hardRequirePool false");

  console.log("buyer-search-replacement-e2e.test.ts: OK");
  } finally {
    if (userId) await teardown(userId);
  }
}

async function teardown(userId: string) {
  try {
    const { db } = await import("../drizzle/db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    await db.delete(users).where(eq(users.id, userId));
    console.log("[Teardown] Test user deleted");
  } catch (err) {
    console.warn("[Teardown] Cleanup failed (non-fatal):", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
