/**
 * Strong structured inbound search — synchronous persist before matching/reply.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/inbound-strong-search-sync.test.ts
 */
import assert from "node:assert/strict";
import { prepareDbTestEnvironment, teardownTestUser } from "./helpers/dbTestGuard.js";

prepareDbTestEnvironment("inbound-strong-search-sync.test.ts");

import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { emptyBuyerPreferenceProfile } from "../shared/buyerPreferenceSchema";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import { extractBuyerMatchCriteria } from "../shared/inventory/inventoryMatchScoring";
import { listingPriceLooksLikeMonthlyRent } from "../shared/inventory/listingTransactionIntent";
import {
  assertBuyerSearchProfileLayersAgree,
  snapshotPatchTraceFields,
  snapshotProfileTraceFields,
} from "../shared/buyerMatchingTrace";
import { buildPersistedProfileSnapshotForDiagnostics } from "../shared/buyerSearchCommandDebug";
import {
  hasStrongStructuredSearchSignals,
  hasPropertyTypeSignalInMessage,
} from "../shared/buyerPreferenceInventorySignals";
import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";

const MSG = "show me 3/2 apparent for sale up to 1 mil";

const { storage } = await import("../server/storage");
const {
  loadPersistedBuyerPreferenceProfile,
  persistBuyerPreferenceProfile,
  processInboundBuyerPreferencesOnMessage,
  readBuyerPreferenceProfile,
} = await import("../server/buyerPreferenceService");
const { findMatchingListingsForContact } = await import("../server/inventory/inventoryMatchingService");

function field<T>(value: T) {
  return { value, source: "explicit" as const, confidence: 1, updatedAt: new Date().toISOString() };
}

async function main() {
  assert(hasStrongStructuredSearchSignals(MSG), "message is strong structured search");
  assert(hasPropertyTypeSignalInMessage(MSG), "apparent typo counts as property type signal");
  const heuristic = heuristicPatchFromInboundText(MSG);
  assert(
    heuristic.propertyTypes?.value?.includes("condo"),
    `apparent maps to condo (got ${heuristic.propertyTypes?.value?.join()})`,
  );
  assert.equal(heuristic.transactionIntent?.value, "buy", "buy intent from for sale");
  assert.equal(heuristic.priceMax?.value, 1_000_000, "up to 1 mil budget");
  assert.equal(heuristic.bedsMin?.value, 3, "3/2 beds");
  assert.equal(heuristic.bathsMin?.value, 2, "3/2 baths");

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `strong-sync-${Date.now()}@test.com`,
      password: "test123",
      name: "Strong Sync Test",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Strong Sync Contact",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      primaryChannel: "whatsapp",
      customFields: { leadType: "buyer" },
    });

    const priorProfile = mergeBuyerPreferenceProfile(emptyBuyerPreferenceProfile(), {
      transactionIntent: field("rent"),
      priceMax: field(4000),
      propertyTypes: field(["house"]),
      bedsMin: field(3),
      bedsMax: field(5),
      bathsMin: field(2),
      targetAreas: field(["Pompano Beach"]),
    });
    await persistBuyerPreferenceProfile(contact.id, priorProfile);

    const messageId = `msg-strong-sync-${Date.now()}`;
    const saved = await processInboundBuyerPreferencesOnMessage({
      userId: user.id,
      contact: (await storage.getContact(contact.id))!,
      conversationId: "conv-test",
      messageId,
      inboundText: MSG,
      triggerSource: "test",
    });
    assert(saved, "strong sync returns persisted profile");

    const dbProfile = await loadPersistedBuyerPreferenceProfile(contact.id);
    assert(dbProfile, "profile reloaded from DB after inbound sync");

    assert.equal(dbProfile!.transactionIntent?.value, "buy", "saved transactionIntent=buy");
    assert.equal(dbProfile!.priceMax?.value, 1_000_000, "saved priceMax=1M");
    assert(
      dbProfile!.propertyTypes?.value?.includes("condo"),
      `saved propertyTypes includes condo (got ${dbProfile!.propertyTypes?.value?.join()})`,
    );
    assert.equal(dbProfile!.bedsMin?.value, 3, "saved bedsMin=3");
    assert.equal(dbProfile!.bathsMin?.value, 2, "saved bathsMin=2");
    assert.equal(dbProfile!.bedsMax?.value, undefined, "bedsMax cleared on pivot");
    assert.notEqual(dbProfile!.priceMax?.value, 4000, "rental budget cleared");

    const freshContact = (await storage.getContact(contact.id))!;
    const command = parseBuyerSearchCommand(MSG, priorProfile);
    const merged = mergeBuyerPreferenceProfile(
      priorProfile,
      command.patch,
      { lastExtractedAt: new Date().toISOString(), lastInboundAt: new Date().toISOString() },
      {
        replaceArrayFields: command.replaceArrayFields,
        clearUnmentionedHardGates: command.clearUnmentionedHardGates,
        currentMessagePatch: command.clearUnmentionedHardGates ? command.patch : undefined,
      },
    );

    const criteria = extractBuyerMatchCriteria(dbProfile!);
    const matchingSnap = buildPersistedProfileSnapshotForDiagnostics(dbProfile!, criteria);

    const layerErrors = assertBuyerSearchProfileLayersAgree({
      parsedPatch: snapshotPatchTraceFields(command.patch),
      mergedProfile: snapshotProfileTraceFields(merged),
      savedProfile: snapshotProfileTraceFields(dbProfile!),
      matchingProfile: matchingSnap,
      expected: { transactionIntent: "buy", priceMax: 1_000_000 },
    });
    assert.equal(layerErrors.length, 0, `trace layers agree: ${layerErrors.join("; ")}`);

    assert.equal(matchingSnap.transactionIntent, "buy", "matchingProfile uses buy");
    assert.equal(matchingSnap.priceMax, 1_000_000, "matchingProfile priceMax=1M");

    const apiProfile = readBuyerPreferenceProfile(freshContact);
    assert.equal(apiProfile.transactionIntent?.value, "buy", "GET-equivalent read shows buy");

    const matchResult = await findMatchingListingsForContact(contact.id, user.id, {
      traceId: `${contact.id}:${messageId}`,
    });
    if (matchResult.matches?.length) {
      for (const m of matchResult.matches) {
        const price = m.listing?.priceCents ?? null;
        assert.equal(
          listingPriceLooksLikeMonthlyRent(price),
          false,
          `listing ${m.listingId} should not look like monthly rent`,
        );
      }
    }

    console.log("inbound-strong-search-sync.test.ts: OK");
  } finally {
    await teardownTestUser(userId, "inbound-strong-search-sync.test.ts");
  }
}

await main();
