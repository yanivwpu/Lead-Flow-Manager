/**
 * Susu rental matching regression — profile persist, budget refine, sale-scale rent exclusion.
 * Run: ALLOW_DB_TEST_WRITES=1 npx tsx tests/susu-rental-matching-regression.test.ts
 */
import assert from "node:assert/strict";
import { prepareDbTestEnvironment, teardownTestUser } from "./helpers/dbTestGuard.js";

prepareDbTestEnvironment("susu-rental-matching-regression.test.ts");

import { heuristicPatchFromInboundText } from "../shared/buyerPreferenceExtractionNormalize";
import { mergeBuyerPreferenceProfile } from "../shared/buyerPreferenceMerge";
import { parseBuyerSearchCommand } from "../shared/buyerSearchCommand";
import {
  buildBuyerPreferenceSearchChips,
  normalizeForDisplay,
} from "../shared/buyerPreferenceDisplay";
import { buildPersistedProfileSnapshotForDiagnostics } from "../shared/buyerSearchCommandDebug";
import { hasStrongStructuredSearchSignals } from "../shared/buyerPreferenceInventorySignals";
import {
  extractBuyerMatchCriteria,
  getListingExclusionReason,
  rankInventoryMatches,
  type MatchListingInput,
} from "../shared/inventory/inventoryMatchScoring";
import {
  RENT_PRICE_SCALE_MISMATCH,
  listingStoredRentConflictsWithSalePrice,
} from "../shared/inventory/listingTransactionIntent";

const MSG1 =
  "SFH rental in Pompano Beach close to beach at least 3 bedrooms 2 bath up to $7k";
const MSG2 = "Can you find up to 10k?";

const misclassifiedRentListing: MatchListingInput = {
  id: "21412e00-d51e-4979-86ca-985949656a83",
  providerListingId: "A11986163",
  status: "active",
  priceCents: 79_500_000,
  city: "Pompano Beach",
  state: "FL",
  addressLine1: "100 Misclassified St",
  addressLine2: null,
  zip: "33062",
  beds: 3,
  baths: 2,
  propertyType: "house",
  description: "Single family home",
  features: [],
  listingDetails: { listingTransactionType: "rent" },
  listingUrl: null,
  photos: [],
};

const validRentalListing: MatchListingInput = {
  ...misclassifiedRentListing,
  id: "rent-3200",
  providerListingId: "R3200",
  priceCents: 3_200_00,
  propertyType: "house",
  propertySubtype: "Single Family Residence",
  description: "SFH for rent in Pompano",
  listingDetails: { listingTransactionType: "rent" },
};

const { storage } = await import("../server/storage");
const {
  loadPersistedBuyerPreferenceProfile,
  processInboundBuyerPreferencesOnMessage,
  readBuyerPreferenceProfile,
} = await import("../server/buyerPreferenceService");

function field<T>(value: T) {
  return { value, source: "explicit" as const, confidence: 1, updatedAt: new Date().toISOString() };
}

async function main() {
  assert(hasStrongStructuredSearchSignals(MSG1), "msg1 is strong structured search");
  assert(hasStrongStructuredSearchSignals(MSG2), "msg2 budget refine is strong structured search");

  const patch1 = heuristicPatchFromInboundText(MSG1);
  assert.equal(patch1.transactionIntent?.value, "rent");
  assert.equal(patch1.priceMax?.value, 7000);
  assert.equal(patch1.bedsMin?.value, 3);
  assert.equal(patch1.bathsMin?.value, 2);
  assert.equal(patch1.propertyTypes?.value?.join(), "house");
  assert(
    patch1.targetAreas?.value?.some((a) => /pompano beach/i.test(a)),
    "city in targetAreas",
  );
  assert(
    patch1.geoPreferences?.value?.some((a) => /close to beach/i.test(a)),
    "close to beach in geoPreferences",
  );
  assert(
    !patch1.targetAreas?.value?.some((a) => /close to beach/i.test(a)),
    "close to beach not in targetAreas",
  );

  let userId: string | undefined;
  try {
    const user = await storage.createUser({
      email: `susu-rent-${Date.now()}@test.com`,
      password: "test123",
      name: "Susu Rent Regression",
    });
    userId = user.id;

    const contact = await storage.createContact({
      userId: user.id,
      name: "Susu Rent Contact",
      phone: `+1555${String(Date.now()).slice(-7)}`,
      primaryChannel: "whatsapp",
      customFields: { leadType: "buyer" },
    });

    const saved1 = await processInboundBuyerPreferencesOnMessage({
      userId: user.id,
      contact: (await storage.getContact(contact.id))!,
      conversationId: "conv-susu",
      messageId: `msg-susu-1-${Date.now()}`,
      inboundText: MSG1,
      triggerSource: "test",
    });
    assert(saved1, "msg1 returns persisted profile");

    const db1 = await loadPersistedBuyerPreferenceProfile(contact.id);
    assert(db1, "msg1 profile in DB");
    assert.equal(db1!.transactionIntent?.value, "rent");
    assert.equal(db1!.priceMax?.value, 7000);
    assert.equal(db1!.bedsMin?.value, 3);
    assert.equal(db1!.bathsMin?.value, 2);
    assert(db1!.propertyTypes?.value?.includes("house"));
    assert(
      db1!.targetAreas?.value?.some((a) => /pompano beach/i.test(a)),
      `saved areas include Pompano (got ${db1!.targetAreas?.value?.join()})`,
    );
    assert(
      db1!.geoPreferences?.value?.some((a) => /close to beach/i.test(a)),
      "saved geo preference close to beach",
    );

    const chips1 = buildBuyerPreferenceSearchChips(db1!);
    assert(chips1.some((c) => c.value === "Rent"), "Rent chip");
    assert(chips1.some((c) => /pompano beach/i.test(c.value)), "Pompano chip");
    assert(chips1.some((c) => /close to beach/i.test(c.value)), "Close to beach chip");
    assert(chips1.some((c) => c.value === "House"), "House chip");
    assert(chips1.some((c) => /3 bed/.test(c.value)), "3 bed chip");
    assert(chips1.some((c) => /2 bath/.test(c.value)), "2 bath chip");
    assert(chips1.some((c) => /7k\/mo/i.test(c.value)), "Up to $7k/mo chip");

    const saved2 = await processInboundBuyerPreferencesOnMessage({
      userId: user.id,
      contact: (await storage.getContact(contact.id))!,
      conversationId: "conv-susu",
      messageId: `msg-susu-2-${Date.now()}`,
      inboundText: MSG2,
      triggerSource: "test",
    });
    assert(saved2, "msg2 returns persisted profile");

    const db2 = await loadPersistedBuyerPreferenceProfile(contact.id);
    assert(db2, "msg2 profile in DB");
    assert.equal(db2!.transactionIntent?.value, "rent");
    assert.equal(db2!.priceMax?.value, 10_000);
    assert.equal(db2!.bedsMin?.value, 3);
    assert.equal(db2!.bathsMin?.value, 2);
    assert(db2!.propertyTypes?.value?.includes("house"));
    assert(db2!.targetAreas?.value?.some((a) => /pompano beach/i.test(a)));
    assert(db2!.geoPreferences?.value?.some((a) => /close to beach/i.test(a)));

    const command2 = parseBuyerSearchCommand(MSG2, db1!);
    const merged2 = mergeBuyerPreferenceProfile(db1!, command2.patch, {
      lastExtractedAt: new Date().toISOString(),
      lastInboundAt: new Date().toISOString(),
    });
    const criteria2 = extractBuyerMatchCriteria(db2!);
    const matching2 = buildPersistedProfileSnapshotForDiagnostics(db2!, criteria2);
    assert.equal(command2.patch.priceMax?.value, 10_000);
    assert.equal(merged2.priceMax?.value, 10_000);
    assert.equal(db2!.priceMax?.value, 10_000);
    assert.equal(matching2.priceMax, 10_000);
    assert.equal(matching2.transactionIntent, "rent");
    assert.equal(matching2.bedsMin, 3);

    assert(listingStoredRentConflictsWithSalePrice(misclassifiedRentListing), "fixture conflicts");
    const criteria = extractBuyerMatchCriteria(db2!);
    assert.equal(
      getListingExclusionReason(misclassifiedRentListing, criteria),
      RENT_PRICE_SCALE_MISMATCH,
      "A11986163 excluded with RENT_PRICE_SCALE_MISMATCH",
    );

    const ranked = rankInventoryMatches(
      [misclassifiedRentListing, validRentalListing],
      criteria,
      10,
    );
    assert.equal(ranked.length, 1, "only valid rental ranks");
    assert.equal(ranked[0].listingId, validRentalListing.id);

    const apiRead = readBuyerPreferenceProfile((await storage.getContact(contact.id))!);
    assert.equal(normalizeForDisplay(apiRead).priceMax?.value, 10_000);

    console.log("susu-rental-matching-regression.test.ts: OK");
  } finally {
    await teardownTestUser(userId, "susu-rental-matching-regression.test.ts");
  }
}

await main();
