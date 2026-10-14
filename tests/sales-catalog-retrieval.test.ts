import assert from "node:assert/strict";
import test from "node:test";
import { createManualOfferAdapter } from "../server/salesCatalog/manualOfferAdapter";
import {
  createConnectedCommerceSearch,
  type ConnectedCommerceSearchContext,
} from "../server/salesCatalog/connectedCommerceSearch";
import { selectRelevantOffers } from "../shared/workspaceOffers";
import type { SalesCatalogItem } from "../shared/salesCatalog";

function offer(index: number): SalesCatalogItem {
  return {
    id: `offer-${String(index).padStart(5, "0")}`,
    userId: "tenant-a",
    internalName: `Package ${index}`,
    displayName: `Package ${index}`,
    description: "Support",
    benefits: ["Support"],
    priceDisplay: "$49",
    billingCadence: "month",
    checkoutUrl: "https://checkout.example.invalid/exact",
    followUpUrl: null,
    availability: "available",
    active: true,
    sortOrder: Math.floor(index / 3),
    category: null,
    tags: [],
    aiGuidance: null,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test("large manual catalogs retain exact legacy ranking, ties, sibling selection and limits across page boundaries", async () => {
  const offers = Array.from({ length: 2505 }, (_, index) => offer(index));
  offers[2504] = {
    ...offers[2504],
    displayName: "Special Gold",
    internalName: "Special Gold",
  };
  for (const i of [4, 99, 100, 198, 2000])
    offers[i] = { ...offers[i], tags: ["comparison"] };
  const snapshot = structuredClone(offers);
  let calls = 0;
  const manual = createManualOfferAdapter(async (userId, input) => {
    assert.equal(userId, "tenant-a");
    assert.equal(input.status, "purchasable");
    assert.equal(input.limit, 100);
    calls++;
    const offset = input.offset ?? 0;
    return {
      items: offers.slice(offset, offset + 100),
      nextOffset: offset + 100 < offers.length ? offset + 100 : null,
    };
  });
  for (const [message, hint] of [
    ["What packages do you offer?", null],
    ["I want to buy Special Gold", null],
    ["Tell me about Special Gold", null],
    ["comparison", null],
    ["What do you recommend?", "Special Gold"],
  ] as const) {
    for (const limit of [1, 2, 5]) {
      const expected = selectRelevantOffers(offers, message, hint, limit);
      const before = calls;
      const first = await manual.recommend("tenant-a", {
        message,
        hint,
        limit,
      });
      assert.equal(
        calls - before,
        26,
        "Only the explicitly manual adapter traverses all manual pages",
      );
      assert.deepEqual(first, expected);
      assert.deepEqual(
        await manual.recommend("tenant-a", { message, hint, limit }),
        expected,
      );
    }
  }
  assert.deepEqual(offers, snapshot);
});

test("connected commerce makes exactly one bounded query for 10000 products and preserves stable provider ranking", async () => {
  // A future adapter's source index: ranking happens at the source, not in the shared facade.
  const indexed = Array.from({ length: 10000 }, (_, i) => ({
    id: `product-${String(i).padStart(5, "0")}`,
    userId: "tenant-a",
    sourceId: "connected-source",
    score: Math.floor(i / 3),
  })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const snapshot = structuredClone(indexed);
  const requests: ConnectedCommerceSearchContext[] = [];
  const commerce = createConnectedCommerceSearch({
    async searchCandidates(request) {
      requests.push(request);
      return request.userId === "tenant-a" &&
        request.sourceId === "connected-source" &&
        request.query === "Gold"
        ? indexed.slice(0, request.limit)
        : [];
    },
  });
  for (const limit of [1, 25, 100]) {
    const before = requests.length;
    const expected = indexed.slice(0, limit);
    assert.deepEqual(
      await commerce.searchCandidates("tenant-a", {
        sourceId: "connected-source",
        query: "Gold",
        limit,
      }),
      expected,
    );
    assert.equal(requests.length - before, 1);
    assert.deepEqual(
      await commerce.searchCandidates("tenant-a", {
        sourceId: "connected-source",
        query: "Gold",
        limit,
      }),
      expected,
    );
  }
  assert.deepEqual(
    await commerce.searchCandidates("tenant-b", {
      sourceId: "connected-source",
      query: "Gold",
    }),
    [],
  );
  assert.deepEqual(
    await commerce.searchCandidates("tenant-a", {
      sourceId: "different-source",
      query: "Gold",
    }),
    [],
  );
  assert.equal(requests.at(-1)?.limit, 25);
  assert.deepEqual(indexed, snapshot);
});

test("commerce contract rejects invalid requests before adapter calls and fails closed on broken tenant/source/size guarantees", async () => {
  let calls = 0;
  const good = { id: "product", userId: "tenant-a", sourceId: "source" };
  const request = { sourceId: "source", query: "product" };
  let result = [good];
  const commerce = createConnectedCommerceSearch({
    async searchCandidates() {
      calls++;
      return result;
    },
  });
  for (const input of [
    { ...request, limit: 101 },
    { ...request, limit: 0 },
    { ...request, limit: NaN },
    { ...request, limit: 1.5 },
    { ...request, query: "" },
    { ...request, sourceId: "" },
    { ...request, offset: 0 },
    { ...request, query: "x".repeat(201) },
  ])
    await assert.rejects(commerce.searchCandidates("tenant-a", input));
  await assert.rejects(commerce.searchCandidates("", request));
  assert.equal(calls, 0);
  result = [{ ...good, userId: "tenant-b" }];
  await assert.rejects(
    commerce.searchCandidates("tenant-a", request),
    /workspace\/source/,
  );
  result = [{ ...good, sourceId: "other" }];
  await assert.rejects(
    commerce.searchCandidates("tenant-a", request),
    /workspace\/source/,
  );
  result = [good, good];
  await assert.rejects(
    commerce.searchCandidates("tenant-a", request),
    /duplicate/,
  );
  result = [{ ...good, id: "" }];
  await assert.rejects(
    commerce.searchCandidates("tenant-a", request),
    /invalid/,
  );
  result = Array.from({ length: 101 }, (_, i) => ({ ...good, id: String(i) }));
  await assert.rejects(
    commerce.searchCandidates("tenant-a", { ...request, limit: 100 }),
    /candidate limit/,
  );
  assert.equal(
    calls,
    5,
    "No pagination, manual fallback or retries on invalid adapter output",
  );
});
