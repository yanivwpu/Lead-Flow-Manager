import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { hasInventoryPreferenceSignals, hasStrongStructuredSearchSignals } from "../shared/buyerPreferenceInventorySignals";
import { inventoryContactEligibility } from "../shared/inventoryContactEligibility";
import { resolveAiDomainEligibility } from "../shared/aiDomainEligibility";
import { heuristicPatchFromInboundText, heuristicPatchFromTranscript } from "../shared/buyerPreferenceExtractionNormalize";
import { buyerPreferenceEvidenceTranscript } from "../shared/buyerPreferenceEvidence";
import { isInventoryContactEligible } from "../server/inventory/inventoryContactEligibility";
import { storage } from "../server/storage";

// Production wording; payment amount anonymized. Stored criteria are not evidence.
const renewal = "החוב שלך כרגע $1000\nכולל החידוש עד 11/21\nוהדוח";
const profile = {schemaVersion: 1, profileStatus: "partial", targetAreas: {value: ["Fort Lauderdale", "Pompano"], source: "explicit", confidence: 1, updatedAt: "2026-09-04T16:29:33.469Z", evidence: "User stated they are closer to Pompano."},
  bedsMin: {value: 11, source: "inferred", confidence: .86, updatedAt: "2026-11-03T16:16:14.251Z", evidence: "beds in message"}, bathsMin: {value: 21, source: "inferred", confidence: .86, updatedAt: "2026-11-03T16:16:14.251Z", evidence: "baths in message"}};
for (const text of [renewal, "החידוש שלך הוא ב11/21", "Your debt is $1000. Renewal until 11/21", "Debe $1000; renovación hasta 11/21", "Payment $1000 due on 3/2", "Renewal $1000 on 11/21/2026"]) {
  assert.equal(inventoryContactEligibility({rgeInstalled: true, inboundText: text, buyerPreferenceProfile: profile}), false, text);
  assert.equal(resolveAiDomainEligibility({rgeInstalled: true, inboundText: text, buyerProfileHasCriteria: true}).injectInventoryContext, false);
  assert.equal(heuristicPatchFromInboundText(text).bedsMin, undefined, text);
  assert.equal(heuristicPatchFromInboundText(text).bathsMin, undefined, text);
}
for (const text of ["Looking to rent a 3/2 for $3000", "I want to buy a 3/2 for $500k", "Can you send information on a 3/2 condo under $500k?", "Information on 3/2 condos under $500k", "Show me 3/2 under $500k", "Looking for a 3/2.5 condo in Miami", "11 beds and 21 baths house under $5m"]) {
  assert.equal(inventoryContactEligibility({rgeInstalled: true, inboundText: text}), true, text);
  assert.ok(heuristicPatchFromInboundText(text).bedsMin, text);
  assert.ok(heuristicPatchFromInboundText(text).bathsMin, text);
}
// Hostile whitespace must not trigger overlapping room-count quantifiers.
const started = performance.now();
const whitespace = "3" + " ".repeat(100_000) + "unrelated";
assert.equal(hasInventoryPreferenceSignals(whitespace), false);
assert.equal(hasStrongStructuredSearchSignals(whitespace), false);
assert.ok(performance.now() - started < 1500, "room signals handle long whitespace promptly");
const listing = "Show me a 3/2 condo under $500k in Miami";
for (const quoted of [`Thanks\n> ${listing}`, `Thanks\nOn Monday agent wrote:\n${listing}`, `Thanks\n---------- Forwarded message ---------\n${listing}`]) {
  assert.equal(inventoryContactEligibility({rgeInstalled: true, inboundText: quoted}), false, quoted);
  assert.equal(heuristicPatchFromInboundText(quoted).bedsMin, undefined);
}
const transcript = buyerPreferenceEvidenceTranscript([{role: "assistant", content: listing}, {role: "user", content: renewal}]);
assert.equal(transcript, renewal);
assert.equal(heuristicPatchFromTranscript(transcript).bedsMin, undefined, "outbound listing does not feed extraction fallback");

const contact = {id: "car-rental", userId: "tenant", buyerPreferenceProfile: profile} as any;
const originalBundle = storage.getContactWithConversations;
const originalMessages = storage.getMessages;
let messages: any[] = [{direction: "inbound", content: renewal}, {direction: "outbound", content: listing}, {direction: "inbound", content: "החידוש שלך הוא ב11/21"}];
(storage as any).getContactWithConversations = async () => ({contact, conversations: [{id: "thread", userId: "tenant"}]});
(storage as any).getMessages = async () => messages;
try {
  assert.equal(await isInventoryContactEligible(contact), false, "actual production gate with contaminated profile and outbound listing");
  messages.push({direction: "inbound", generatedBy: "ai_brain", content: listing});
  assert.equal(await isInventoryContactEligible(contact), false, "AI artifacts are not independent intent");
  messages.push({direction: "inbound", generatedBy: "human", content: listing});
  for (const neutral of ["Hi", "Thanks", "I took my car for maintenance"]) {
    messages.push({direction: "inbound", content: neutral});
    assert.equal(await isInventoryContactEligible(contact), true, "established buyer continuity without confirmation");
  }
  messages = [{direction: "inbound", content: renewal}];
  assert.equal(await isInventoryContactEligible({...contact, buyerPreferenceProfile: {...profile, agentConfirmedAt: "2026-11-16T00:00:00Z"}}), true);
} finally {
  storage.getContactWithConversations = originalBundle;
  storage.getMessages = originalMessages;
}
console.log("PASS production date/payment contamination, extraction provenance, stored profile, AI/outbound exclusion and genuine buyer continuity");
