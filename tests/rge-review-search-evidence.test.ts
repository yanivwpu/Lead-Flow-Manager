import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { inventoryContactEligibility } from "../shared/inventoryContactEligibility";
import { detectRentalLeadEvidence, hasStrongRealEstateLeadEvidence } from "../shared/aiDomainEligibility";
import { isInventoryContactEligible } from "../server/inventory/inventoryContactEligibility";
import { storage } from "../server/storage";

for (const text of [
  "Show me 3 bed homes in Miami under $500k with a 2-car garage",
  "Looking for a low maintenance condo in Miami under $500k",
  "I want to buy a condo with parking for my car in Miami",
]) assert.equal(inventoryContactEligibility({rgeInstalled: true, inboundText: text}), true, text);
for (const text of [
  "I need a car rental near my apartment under $500",
  "Looking to rent a car in Miami under $500",
  "עשית את הטיפול שמנים לרכב ? תשלח לי תמונה",
]) assert.equal(inventoryContactEligibility({rgeInstalled: true, inboundText: text}), false, text);

const repeatedWhitespace = "need a " + " ".repeat(100_000) + "rental in Miami";
const started = performance.now();
assert.equal(hasStrongRealEstateLeadEvidence(repeatedWhitespace), false);
assert.equal(detectRentalLeadEvidence(repeatedWhitespace), false);
assert.ok(performance.now() - started < 1500, "whitespace-heavy input is bounded in practice");

const originalBundle = storage.getContactWithConversations;
const originalMessages = storage.getMessages;
const contact = {id: "buyer", userId: "tenant", customFields: {leadType: "buyer"}, buyerPreferenceProfile: {schemaVersion: 1, profileStatus: "empty"}} as any;
let pages = [["I want to buy", "A condo", "In Miami", "Under $500k", "Hi!"]];
(storage as any).getContactWithConversations = async () => ({contact, conversations: [{id: "thread", userId: "tenant"}]});
(storage as any).getMessages = async (_id: string, _limit: number, offset = 0) => (pages[offset / 100] || []).map(content => ({direction: "inbound", content}));
try {
  assert.equal(await isInventoryContactEligible(contact), true, "buyer requirements spread across replies");
  pages = [["A condo", "In Miami", "Under $500k", ...Array(97).fill("Hello")], ["I want to buy"]];
  assert.equal(await isInventoryContactEligible(contact), true, "fragmented intent crosses pagination boundary");
  pages = [["I need to rent a car", "Near my apartment", "In Miami", "Under $500"]];
  assert.equal(await isInventoryContactEligible(contact), false, "fragmented vehicle intent stays ineligible");
  (storage as any).getContactWithConversations = async () => ({contact, conversations: [{id: "foreign-thread", userId: "foreign"}]});
  pages = [["I want to buy", "A condo", "Under $500k"]];
  assert.equal(await isInventoryContactEligible(contact), false, "never combine foreign-tenant evidence");
} finally {
  storage.getContactWithConversations = originalBundle;
  storage.getMessages = originalMessages;
}
console.log("PASS review evidence: garage/maintenance buyers, coherent turns, pagination, vehicle exclusion, whitespace runtime, tenant scope");
