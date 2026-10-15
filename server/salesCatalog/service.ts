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
import { createCommerceStore, type CatalogDb } from "./commerceStore";
import { createManualOfferAdapter } from "./manualOfferAdapter";

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
    commerce: createCommerceStore(database as CatalogDb),
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
    // Existing AI/API compatibility: recommendations here are manual offers only.
    // Connected products must use the separate bounded commerce search contract.
    recommend: createManualOfferAdapter(search).recommend,
  };
}
export type SalesCatalogService = ReturnType<typeof createSalesCatalogService>;
