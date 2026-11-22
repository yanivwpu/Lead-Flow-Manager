import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nextMatchPageOffset, uniqueInventoryMatchPages } from "../client/src/lib/inventoryMatchPagination";
import type { InventoryMatchResult } from "../shared/inventory/inventoryMatchTypes";

const card = (listingId: string) => ({ listingId, score: 90, reasons: [], providerListingId: listingId, listing: {} }) as InventoryMatchResult;
const page = (ids: string[], matchCount: number) => ({ matches: ids.map(card), matchCount });

test("View more requests next 10 at the correct offset and appends (not replaces)", () => {
  const p1 = page(Array.from({ length: 10 }, (_, n) => String(n)), 107);
  const p2 = page(Array.from({ length: 10 }, (_, n) => String(n + 10)), 107);
  assert.equal(nextMatchPageOffset([p1]), 10);
  assert.equal(nextMatchPageOffset([p1, p2]), 20);
  assert.deepEqual(uniqueInventoryMatchPages([p1, p2]).map(x => x.listingId), Array.from({ length: 20 }, (_, n) => String(n)));
  assert.equal(nextMatchPageOffset([page(["a", "b"], 2)]), undefined);
  assert.equal(nextMatchPageOffset([page([], 10)]), undefined);
  // A shareability gate can trim a page; offset must still advance by the requested 10.
  assert.equal(nextMatchPageOffset([page(["a", "b"], 30)]), 10);
});

test("duplicate listing cards after a re-rank are shown only once", () => {
  assert.deepEqual(uniqueInventoryMatchPages([page(["1", "2"], 3), page(["2", "3"], 3)]).map(x => x.listingId), ["1","2","3"]);
});

test("Copilot exposes contact-scoped saved shortlist and does not overwrite earlier result pages", () => {
  const panel = readFileSync(join(process.cwd(), "client/src/components/inventory/MatchingListingsPanel.tsx"), "utf8");
  const saved = readFileSync(join(process.cwd(), "client/src/components/inventory/SavedInventoryMatches.tsx"), "utf8");
  const service = readFileSync(join(process.cwd(), "server/inventory/inventorySavedMatchService.ts"), "utf8");
  const routes = readFileSync(join(process.cwd(), "server/routes/contacts.ts"), "utf8");
  assert.match(panel, /useInfiniteQuery/);
  assert.match(panel, /fetchNextPage/);
  assert.match(panel, /nextCard\.scrollIntoView/);
  assert.match(panel, /firstNewCardIndexRef/);
  assert.match(panel, /nextMatchPageOffset/);
  assert.match(panel, /button-view-more-matches/);
  assert.match(panel, /button-saved-property-shortlist/);
  assert.match(panel, /uniqueInventoryMatchPages/);
  assert.doesNotMatch(panel, /setMatchOffset\(/);
  assert.match(saved, /saved-inventory-matches/);
  assert.match(saved, /contactId/);
  assert.match(saved, /onSavedChange/);
  assert.match(service, /contact\.userId !== userId/);
  assert.match(service, /isInventoryContactEligible/);
  assert.match(service, /canDirectShareListing/);
  assert.match(service, /canShowPublicStreetAddress/);
  assert.match(routes, /app\.get\("\/api\/contacts\/:id\/inventory-matches\/saved"/);
});

test("visible MLS image prioritized without removing lazy loading or flyer permissions", () => {
  const recommendation = readFileSync(join(process.cwd(), "client/src/components/recommendations/RecommendationCard.tsx"), "utf8");
  const flyer = readFileSync(join(process.cwd(), "shared/inventory/publicListingFlyer.ts"), "utf8");
  assert.match(recommendation, /loading=\{image\.priority \? "eager" : "lazy"\}/);
  assert.match(recommendation, /decoding="async"/);
  assert.match(flyer, /renderFlyerHeroResourceHints\(photos\[0\]\?\.url\)/);
  assert.match(flyer, /fetchpriority="high"/);
  assert.match(flyer, /loading="lazy" decoding="async"/);
  assert.match(flyer, /allowStreetAddress \? rawListing : mlsDisplay\.listing/);
});
