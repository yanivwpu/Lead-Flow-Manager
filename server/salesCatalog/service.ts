import {
  and,
  asc,
  eq,
  ilike,
  isNull,
  isNotNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { workspaceOffers } from "@shared/schema";
import {
  salesCatalogSearchSchema,
  type SalesCatalogSearch,
  type SalesCatalogPage,
  type SalesCatalogItem,
} from "@shared/salesCatalog";
import { toWorkspaceOfferView } from "../workspaceOffers/offerView";
import {
  selectRelevantOffers,
  scoreOfferRelevance,
} from "@shared/workspaceOffers";

type CatalogDatabase = Pick<NodePgDatabase, "select">;
/** Read-only facade; consumers supply a trusted workspace owner id, never a body/query tenant id. */
export function createSalesCatalogService(database: CatalogDatabase) {
  function tenant(userId: string): SQL {
    if (!userId.trim()) throw new Error("Workspace id is required");
    return eq(workspaceOffers.userId, userId);
  }
  async function search(
    userId: string,
    input: SalesCatalogSearch = {},
  ): Promise<SalesCatalogPage> {
    const filters = salesCatalogSearchSchema.parse(input);
    const conditions: SQL[] = [tenant(userId)];
    conditions.push(
      filters.status === "archived"
        ? isNotNull(workspaceOffers.archivedAt)
        : isNull(workspaceOffers.archivedAt),
    );
    if (filters.status === "active" || filters.status === "purchasable")
      conditions.push(eq(workspaceOffers.active, true));
    if (filters.status === "inactive")
      conditions.push(eq(workspaceOffers.active, false));
    if (filters.status === "purchasable")
      conditions.push(
        sql`${workspaceOffers.availability} IN ('available', 'limited')`,
      );
    if (filters.category)
      conditions.push(eq(workspaceOffers.category, filters.category));
    if (filters.tag)
      conditions.push(
        sql`${workspaceOffers.tags} @> ${JSON.stringify([filters.tag])}::jsonb`,
      );
    if (filters.availability)
      conditions.push(eq(workspaceOffers.availability, filters.availability));
    if (filters.query) {
      // Literal substring search: PostgreSQL LIKE metacharacters are not user wildcards.
      const pattern = `%${filters.query.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(
        or(
          ilike(workspaceOffers.displayName, pattern),
          ilike(workspaceOffers.internalName, pattern),
          ilike(workspaceOffers.description, pattern),
        )!,
      );
    }
    const rows = await database
      .select()
      .from(workspaceOffers)
      .where(and(...conditions))
      .orderBy(
        asc(workspaceOffers.sortOrder),
        asc(workspaceOffers.createdAt),
        asc(workspaceOffers.id),
      )
      .limit(filters.limit + 1)
      .offset(filters.offset);
    return {
      items: rows.slice(0, filters.limit).map(toWorkspaceOfferView),
      nextOffset:
        rows.length > filters.limit ? filters.offset + filters.limit : null,
    };
  }
  return {
    search,
    async lookup(
      userId: string,
      itemId: string,
      options: { purchasableOnly?: boolean } = {},
    ): Promise<SalesCatalogItem | null> {
      const conditions = [
        tenant(userId),
        eq(workspaceOffers.id, itemId),
        isNull(workspaceOffers.archivedAt),
      ];
      if (options.purchasableOnly)
        conditions.push(
          eq(workspaceOffers.active, true),
          sql`${workspaceOffers.availability} IN ('available', 'limited')`,
        );
      const [row] = await database
        .select()
        .from(workspaceOffers)
        .where(and(...conditions))
        .limit(1);
      return row ? toWorkspaceOfferView(row) : null;
    },
    async recommend(
      userId: string,
      input: { message: string; hint?: string | null; limit?: number },
    ): Promise<SalesCatalogItem[]> {
      const limit = Math.max(1, Math.min(5, Math.floor(input.limit ?? 5)));
      // Preserve global legacy matching/sibling semantics while bounding database reads and retained candidates.
      // Phase 1A manual offers are small; provider-scale ranked retrieval comes with commerce adapters.
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
export type SalesCatalogService = ReturnType<typeof createSalesCatalogService>;
