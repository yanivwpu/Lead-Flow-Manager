import { commerceFiltersSchema } from "@shared/commerceCatalog";
import { z } from "zod";
import { SALES_CATALOG_PAGE_MAX } from "@shared/salesCatalog";

const requestSchema = z
  .object({
    sourceId: z.string().trim().min(1).max(160),
    query: z.string().trim().min(1).max(200),
    filters: commerceFiltersSchema.optional(),
    hint: z.string().trim().max(160).nullable().optional(),
    limit: z.number().int().min(1).max(SALES_CATALOG_PAGE_MAX).default(25),
  })
  .strict();

/** Identity only: actual products/variants remain the next phase's responsibility. */
export type ConnectedCommerceCandidate = {
  id: string;
  userId: string;
  sourceId: string;
};
export type ConnectedCommerceSearchRequest = z.input<typeof requestSchema>;
export type ConnectedCommerceSearchContext = z.output<typeof requestSchema> & {
  userId: string;
};

export interface ConnectedCommerceSearchAdapter<
  T extends ConnectedCommerceCandidate,
> {
  /**
   * One tenant/source-scoped, indexed query with a database/provider result limit.
   * Filter and rank at the source; ties must use a stable unique identifier.
   * Do not scan/paginate the catalog or reuse manual-offer recommendation traversal.
   * Return eligible candidates in final ranking order, never a cursor or next page.
   */
  searchCandidates(
    context: ConnectedCommerceSearchContext,
  ): Promise<readonly T[]>;
}

/** Bounded entry point for future connected adapters; no provider is wired in Phase 1A. */
export function createConnectedCommerceSearch<
  T extends ConnectedCommerceCandidate,
>(adapter: ConnectedCommerceSearchAdapter<T>) {
  return {
    async searchCandidates(
      userId: string,
      input: ConnectedCommerceSearchRequest,
    ): Promise<readonly T[]> {
      if (!userId.trim()) throw new Error("Workspace id is required");
      const request = requestSchema.parse(input);
      // Exactly one bounded adapter query. There is deliberately no pagination or fallback.
      const items = await adapter.searchCandidates({ ...request, userId });
      if (items.length > request.limit)
        throw new Error("Commerce search exceeded candidate limit");
      const ids = new Set<string>();
      for (const item of items) {
        if (item.userId !== userId || item.sourceId !== request.sourceId)
          throw new Error(
            "Commerce search returned an item outside the requested workspace/source",
          );
        if (!item.id || ids.has(item.id))
          throw new Error(
            "Commerce search returned invalid or duplicate item ids",
          );
        ids.add(item.id);
      }
      return items; // Preserve adapter ranking; never locally reorder or invent additional candidates.
    },
  };
}
