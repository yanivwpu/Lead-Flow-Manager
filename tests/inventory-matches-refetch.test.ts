/**
 * Inventory matches client refetch helpers.
 * Run: npx tsx tests/inventory-matches-refetch.test.ts
 */
import type { InventoryMatchesResponse } from "../shared/inventory/inventoryMatchTypes";
import {
  inventoryMatchesQueryKey,
  inventoryMatchesQueryKeyContactId,
  inventoryMatchesPlaceholderData,
  isRateLimitedInventoryMatchesError,
  InventoryMatchesFetchError,
  inventoryMatchesHasDisplayableResults,
  shouldRetryInventoryMatches,
  inventoryMatchesRetryDelay,
} from "../client/src/lib/inventoryMatchesQuery";
import {
  contactHasInventoryMatchCriteria,
  shouldShowCopilotInventoryForContact,
} from "../client/src/lib/copilotRgeVisibility";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  inventoryMatchesQueryKey("abc")[0] === "/api/contacts/abc/inventory-matches",
  "query key",
);

assert(
  isRateLimitedInventoryMatchesError(new InventoryMatchesFetchError("Too many requests", 429)),
  "429 class error",
);
assert(
  isRateLimitedInventoryMatchesError(new Error("429: Too many requests. Please try again shortly.")),
  "429 message error",
);

const sampleResponse = {
  eligible: true,
  matches: [{ listingId: "1", score: 90, reasons: [], listing: { listingId: "1" } }],
  matchCount: 1,
  savedListingIds: [],
  reason: "ok",
} as InventoryMatchesResponse;

assert(inventoryMatchesHasDisplayableResults(sampleResponse), "has displayable matches");
assert(
  !inventoryMatchesHasDisplayableResults({
    ...sampleResponse,
    matches: [],
    matchCount: 0,
  }),
  "empty matches",
);

assert(shouldRetryInventoryMatches(0, new InventoryMatchesFetchError("x", 429)), "retry 429 first");
assert(shouldRetryInventoryMatches(2, new InventoryMatchesFetchError("x", 429)), "retry 429 third");
assert(!shouldRetryInventoryMatches(3, new InventoryMatchesFetchError("x", 429)), "stop 429 fourth");

assert(inventoryMatchesRetryDelay(1, new InventoryMatchesFetchError("x", 429)) === 4_000, "429 backoff");

assert(
  inventoryMatchesQueryKeyContactId(inventoryMatchesQueryKey("abc")) === "abc",
  "parse contact id from key",
);

assert(
  inventoryMatchesPlaceholderData("b", sampleResponse, { queryKey: inventoryMatchesQueryKey("b") }) ===
    sampleResponse,
  "placeholder same contact",
);
assert(
  inventoryMatchesPlaceholderData("b", sampleResponse, { queryKey: inventoryMatchesQueryKey("a") }) ===
    undefined,
  "placeholder blocks cross-contact",
);

assert(
  shouldShowCopilotInventoryForContact({
    inventoryStatus: { canUse: true, rgeInstalled: true } as any,
    customFields: { leadType: "buyer" },
  }),
  "inventory for buyer lead",
);
assert(
  !shouldShowCopilotInventoryForContact({
    inventoryStatus: { canUse: true, rgeInstalled: true } as any,
    customFields: { leadType: "vendor" },
  }),
  "no inventory for unrelated lead",
);
const pompanoPrefs = {
  schemaVersion: 1,
  profileStatus: "partial",
  targetAreas: { value: ["Pompano Beach"], source: "explicit", confidence: 0.9, updatedAt: "2026-01-01" },
} as const;

assert(
  shouldShowCopilotInventoryForContact({
    inventoryStatus: { canUse: true, rgeInstalled: true } as any,
    buyerPreferenceProfile: pompanoPrefs,
  }),
  "inventory when prefs have match criteria",
);
assert(
  !shouldShowCopilotInventoryForContact({
    inventoryStatus: { canUse: true, rgeInstalled: true } as any,
    buyerPreferenceProfile: { schemaVersion: 1, profileStatus: "partial" },
  }),
  "no inventory for partial prefs without criteria",
);
assert(
  !contactHasInventoryMatchCriteria({ schemaVersion: 1, profileStatus: "partial" }),
  "empty criteria profile",
);
assert(contactHasInventoryMatchCriteria(pompanoPrefs), "criteria from target areas");

console.log("inventory-matches-refetch.test.ts: all passed");
