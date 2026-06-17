/**
 * Listing recommendation follow-up routing + composer tests.
 * Run: npx tsx tests/inventory-listing-followup.test.ts
 */
import {
  resolveAiRouting,
  routingShouldTriggerHandoff,
} from "../shared/aiRouting";
import {
  buildListingComposerMessage,
  listingComposerDraftIncludesRequiredDetails,
} from "../shared/inventory/inventoryComposerDraft";
import { detectListingFollowUp } from "../shared/inventory/inventoryListingFollowUp";
import { buildListingShareUrl } from "../shared/inventory/listingViewUrl";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "11111111-1111-4111-8111-111111111111";
const appOrigin = "https://app.example.com";
const shareUrl = buildListingShareUrl(listingId, appOrigin);
const agentListingMessage = buildListingComposerMessage({
  listing: {
    listingId,
    priceCents: 26_900_000,
    beds: 2,
    baths: 2,
    city: "Pompano Beach",
    state: "FL",
    propertyType: "condo",
    listingUrl: null,
    description: "Modern condo with ocean/golf views",
  },
  contactFirstName: "Susu",
  introDraft: "Hi Susu, I found a condo in Pompano Beach that matches what you're looking for:",
  featureHints: ["Within budget", "2 bed / 2 bath"],
  viewUrl: shareUrl,
}).text;

assert(agentListingMessage.includes("$269,000"), "agent message includes price");
assert(
  agentListingMessage.includes(shareUrl),
  "agent message includes server share URL",
);
assert(
  listingComposerDraftIncludesRequiredDetails(agentListingMessage, {
    listingId,
    priceCents: 26_900_000,
    beds: 2,
    baths: 2,
    city: "Pompano Beach",
    listingUrl: null,
  }, { viewUrl: shareUrl }),
  "composer includes required details + view link",
);

const history = [
  { role: "user", content: "Looking for a 2/2 condo in Pompano under $280k" },
  { role: "assistant", content: agentListingMessage },
  { role: "user", content: "Yes please send more details" },
];

const followUp = detectListingFollowUp(history, "Yes please send more details");
assert(followUp.active, "detects listing follow-up");
assert(followUp.listingId === listingId, "parses listing id from share URL");

const routing = resolveAiRouting({
  inbound: "Yes please send more details",
  history,
  industry: "Real Estate",
  handoffKeywords: ["call me", "human", "agent", "speak to someone"],
});

assert(routing.decision === "CONTINUE_AI", "listing follow-up stays on AI");
assert(routing.reason === "listing_follow_up", "listing follow-up reason");
assert(routingShouldTriggerHandoff(routing) === false, "no handoff on send more details");

console.log("inventory-listing-followup.test.ts: all passed");
