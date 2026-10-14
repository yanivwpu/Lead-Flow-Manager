import type {
  SalesCatalogSearch,
  SalesCatalogPage,
  SalesCatalogItem,
} from "@shared/salesCatalog";
import {
  selectRelevantOffers,
  scoreOfferRelevance,
} from "@shared/workspaceOffers";

/** Manual-only compatibility adapter. Exact legacy ranking needs every eligible offer. */
export function createManualOfferAdapter(
  search: (
    userId: string,
    input: SalesCatalogSearch,
  ) => Promise<SalesCatalogPage>,
) {
  return {
    async recommend(
      userId: string,
      input: { message: string; hint?: string | null; limit?: number },
    ): Promise<SalesCatalogItem[]> {
      const limit = Math.max(1, Math.min(5, Math.floor(input.limit ?? 5)));
      // This full traversal is exclusively for manual workspace_offers compatibility.
      // Never use it for connected products: their adapters must use connectedCommerceSearch.
      // Retain only the first five fallback/sibling offers and top three legacy matches.
      const first: SalesCatalogItem[] = [];
      let matches: SalesCatalogItem[] = [];
      let offset: number | null = 0;
      do {
        const page: SalesCatalogPage = await search(userId, {
          status: "purchasable",
          limit: 100,
          offset,
        });
        first.push(...page.items.slice(0, Math.max(0, 5 - first.length)));
        matches = [
          ...matches,
          ...page.items.filter(
            (item) =>
              scoreOfferRelevance(item, input.message, input.hint ?? null) >=
              40,
          ),
        ]
          .sort(
            (a, b) =>
              scoreOfferRelevance(b, input.message, input.hint ?? null) -
                scoreOfferRelevance(a, input.message, input.hint ?? null) ||
              a.sortOrder - b.sortOrder,
          )
          .slice(0, 3);
        offset = page.nextOffset;
      } while (offset !== null);
      return selectRelevantOffers(
        [
          ...new Map(
            [...first, ...matches].map((item) => [item.id, item]),
          ).values(),
        ],
        input.message,
        input.hint ?? null,
        limit,
      );
    },
  };
}
