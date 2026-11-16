import assert from "node:assert/strict";
import { inventoryContactEligibility, hasConfirmedBuyerEnrollment } from "../shared/inventoryContactEligibility";
import { resolveAiDomainEligibility, stripIneligibleRealEstateContactContext } from "../shared/aiDomainEligibility";
import { buyerPreferenceExtractionPatchSchema } from "../shared/buyerPreferenceSchema";
import { inventoryMatchesPlaceholderData, inventoryMatchesQueryKey, fetchInventoryMatches } from "../client/src/lib/inventoryMatchesQuery";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const staleProfile = {
  schemaVersion: 1, profileStatus: "partial",
  targetAreas: { value: ["Fort Lauderdale", "Pompano"], source: "inferred", confidence: .95, updatedAt: "2026-01-01" },
  bedsMin: { value: 11, source: "inferred", confidence: .95, updatedAt: "2026-01-01" },
};
const unrelated = [
  "היי יניב כמה תוכל לשלם ביום חמישי ? עשית את הטיפול שמנים לרכב ? תשלח לי בבקשה גם תמונה של המיילים",
  "I need a car rental in Pompano under $500. Please send the maintenance photos.",
  "Necesito alquilar un carro en Miami. ¿Cuánto debo pagar por mantenimiento?",
  "I want to buy a phone under $500 in Miami",
  "Can you help with the invoice?",
  "I need a car rental near my apartment under $500",
];
for (const conversationText of unrelated) {
  assert.equal(inventoryContactEligibility({ rgeInstalled: true, leadType: "buyer", conversationText, buyerPreferenceProfile: staleProfile }), false, conversationText);
  const decision = resolveAiDomainEligibility({rgeInstalled: true, inboundText: conversationText, buyerProfileHasCriteria: true, leadType: "buyer"});
  assert.equal(decision.injectInventoryContext, false);
  assert.equal(stripIneligibleRealEstateContactContext({ inventoryMatchSummary: "88 matches" }, decision).inventoryMatchSummary, undefined);
}
for (const conversationText of ["I want to rent a 2 bedroom apartment in Pompano under $2000", "I'm looking to buy a condo in Pompano under $500k", "Quiero alquilar un apartamento en Miami", "אני רוצה לשכור דירה"]) {
  assert.equal(inventoryContactEligibility({ rgeInstalled: true, conversationText }), true, conversationText);
  assert.equal(inventoryContactEligibility({ rgeInstalled: true, inboundText: "Hi, how are you?", conversationText, buyerPreferenceProfile: staleProfile }), true, "buyer continuity");
}
assert.equal(inventoryContactEligibility({rgeInstalled: true, buyerPreferenceProfile: {...staleProfile, targetAreas: {...staleProfile.targetAreas, source: "explicit", evidence: "Buy a condo in Miami"}}, conversationText: unrelated[0]}), false, "even purported explicit saved evidence requires contact history or agent confirmation");
const confirmed = { ...staleProfile, agentConfirmedAt: "2026-11-16T00:00:00Z" };
assert.equal(inventoryContactEligibility({rgeInstalled: true, buyerPreferenceProfile: confirmed, conversationText: unrelated[0]}), true, "agent confirmation");
assert.equal(hasConfirmedBuyerEnrollment({...staleProfile, bedsMin: {...staleProfile.bedsMin, evidence: "I want to buy a condo in Miami"}}), false, "inferred evidence cannot authorize matching");
assert.equal(buyerPreferenceExtractionPatchSchema.safeParse({agentConfirmedAt: "2026-11-16"}).success, false, "LLM cannot set confirmation");

// A late response for A stays in A's cache after the observer switches to B.
const client = new QueryClient({defaultOptions: {queries: {retry: false, gcTime: 0}}});
let resolveA!: (value: any) => void;
const observer = new QueryObserver(client, {
  queryKey: inventoryMatchesQueryKey("buyer"),
  queryFn: () => new Promise(resolve => {resolveA = resolve;}),
});
const unsubscribe = observer.subscribe(() => {});
observer.setOptions({queryKey: inventoryMatchesQueryKey("unrelated"), queryFn: async () => ({eligible: false, matches: [], matchCount: 0}),
  placeholderData: (data, previous) => inventoryMatchesPlaceholderData("unrelated", data as any, previous) as any});
resolveA({eligible: true, matches: [{listingId: "buyer-only"}], matchCount: 88});
await new Promise(resolve => setTimeout(resolve, 10));
assert.deepEqual((observer.getCurrentResult().data as any).matches, []);
assert.equal((observer.getCurrentResult().data as any).matchCount, 0);
unsubscribe(); client.clear();
const originalFetch = globalThis.fetch;
const controller = new AbortController();
globalThis.fetch = async (_url, init) => { assert.equal(init?.signal, controller.signal); return new Response(JSON.stringify({eligible: false, matches: [], matchCount: 0})); };
try { await fetchInventoryMatches("unrelated", undefined, controller.signal); } finally { globalThis.fetch = originalFetch; }
console.log("PASS inventory contact eligibility, continuity, AI context, late-response isolation and cancellation");
