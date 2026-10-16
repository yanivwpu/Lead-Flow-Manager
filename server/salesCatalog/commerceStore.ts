import {
  markInventoryActivity,
  verifyInventoryForPurchase,
  inventoryState,
} from "./shopify/inventory";
import { shopifyCatalogRequest } from "./shopify/api";
import { and, asc, eq, isNull, sql, getTableColumns } from "drizzle-orm";
import {
  catalogSources,
  catalogProducts,
  catalogVariants,
  catalogMedia,
  catalogCollections,
  catalogMemberships,
} from "@shared/schema";
import {
  catalogSearchTerms,
  commerceAnnotationSchema,
  variantAvailability,
  type CommerceProduct,
} from "@shared/commerceCatalog";
import {
  createConnectedCommerceSearch,
  type ConnectedCommerceSearchContext,
} from "./connectedCommerceSearch";
import { resolveCatalogInstallation } from "./shopify/installation";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
export type CatalogDb = NodePgDatabase<any>;
export function createCommerceStore(
  database: CatalogDb,
  requestFor = shopifyCatalogRequest,
) {
  async function source(userId: string, sourceId?: string) {
    const install = await resolveCatalogInstallation(database, userId);
    if (!install) return null;
    const [row] = await database
      .select()
      .from(catalogSources)
      .where(
        and(
          eq(catalogSources.userId, userId),
          eq(catalogSources.shop, install.shop),
          eq(catalogSources.integrationId, install.integrationId),
          ...(sourceId
            ? [eq(catalogSources.id, sourceId)]
            : [eq(catalogSources.provider, "shopify")]),
        ),
      )
      .limit(1);
    return row ?? null;
  }
  function variantFilters(
    alias: string,
    filters: ConnectedCommerceSearchContext["filters"],
    healthy: boolean,
    allowStale = false,
  ) {
    const f = filters ?? {},
      v = sql.identifier(alias);
    const fresh = allowStale
      ? sql`${healthy}`
      : sql`${v}.verified_at > NOW() - interval '15 minutes' AND ${healthy}`;
    return sql`
      ${f.minPrice ? sql`AND ${v}.price >= ${f.minPrice}::numeric` : sql``}
      ${f.maxPrice ? sql`AND ${v}.price <= ${f.maxPrice}::numeric` : sql``}
      ${f.currency ? sql`AND ${v}.currency = ${f.currency}` : sql``}
      ${f.variantId ? sql`AND (${v}.id = ${f.variantId} OR ${v}.external_id = ${f.variantId})` : sql``}
      ${f.availability === "available" ? sql`AND ${fresh} AND ${v}.available_for_sale = true AND ${v}.requires_components = false AND (${v}.tracked = false OR (${v}.tracked = true AND (${v}.inventory_policy = 'CONTINUE' OR (${v}.inventory_policy = 'DENY' AND ${v}.quantity > 0))))` : sql``}
      ${f.availability === "out_of_stock" ? sql`AND ${fresh} AND ${v}.requires_components = false AND (${v}.available_for_sale IS NOT NULL AND ${v}.tracked = true AND ${v}.inventory_policy = 'DENY' AND ${v}.quantity <= 0)` : sql``}
      ${f.availability === "not_tracked" ? sql`AND ${fresh} AND ${v}.requires_components = false AND ${v}.available_for_sale = true AND ${v}.tracked = false` : sql``}
      ${f.availability === "unknown" ? sql`AND (NOT (${fresh}) OR ${v}.requires_components = true OR NOT COALESCE(((${v}.available_for_sale = true AND (${v}.tracked = false OR (${v}.tracked = true AND (${v}.inventory_policy = 'CONTINUE' OR (${v}.inventory_policy = 'DENY' AND ${v}.quantity > 0))))) OR (${v}.available_for_sale IS NOT NULL AND ${v}.tracked = true AND ${v}.inventory_policy = 'DENY' AND ${v}.quantity <= 0)), false))` : sql``}`;
  }
  async function products(
    userId: string,
    sourceId: string,
    ids: string[],
    filters: ConnectedCommerceSearchContext["filters"] = {},
    allowStale = false,
  ): Promise<CommerceProduct[]> {
    if (ids.length > 100) throw new Error("catalog_candidate_limit");
    if (!ids.length) return [];
    const activeSource = await source(userId, sourceId);
    if (!activeSource) return [];
    const healthy =
      !activeSource.errorCode &&
      !inventoryState(activeSource.checkpoint).errorCode &&
      ["ready", "syncing"].includes(activeSource.status);
    const records = await database
      .select({
        ...getTableColumns(catalogProducts),
        availability: sql<"available" | "out_of_stock" | "unavailable">`CASE
          WHEN NOT (${healthy} AND catalog_products.complete AND catalog_products.published
            AND catalog_products.status='ACTIVE' AND catalog_products.deleted_at IS NULL) THEN 'unavailable'
          WHEN EXISTS (SELECT 1 FROM catalog_variants a WHERE a.product_id=catalog_products.id
            AND a.user_id=${userId} AND a.source_id=${sourceId}
            ${variantFilters("a", { availability: "available" }, healthy)}) THEN 'available'
          WHEN EXISTS (SELECT 1 FROM catalog_variants a WHERE a.product_id=catalog_products.id
            AND a.user_id=${userId} AND a.source_id=${sourceId})
            AND NOT EXISTS (SELECT 1 FROM catalog_variants a WHERE a.product_id=catalog_products.id
              AND a.user_id=${userId} AND a.source_id=${sourceId} AND NOT COALESCE((
                a.verified_at > NOW() - interval '15 minutes' AND a.requires_components=false
                AND (a.available_for_sale IS NOT NULL AND a.tracked=true AND a.inventory_policy='DENY' AND a.quantity <= 0)), false)) THEN 'out_of_stock'
          ELSE 'unavailable' END`,
        minPrice: sql<
          string | null
        >`(SELECT min(price)::text FROM catalog_variants r WHERE r.product_id=catalog_products.id AND r.user_id=${userId} AND r.source_id=${sourceId})`,
        maxPrice: sql<
          string | null
        >`(SELECT max(price)::text FROM catalog_variants r WHERE r.product_id=catalog_products.id AND r.user_id=${userId} AND r.source_id=${sourceId})`,
        currency: sql<
          string | null
        >`(SELECT min(currency) FROM catalog_variants r WHERE r.product_id=catalog_products.id AND r.user_id=${userId} AND r.source_id=${sourceId})`,
      })
      .from(catalogProducts)
      .where(
        and(
          eq(catalogProducts.userId, userId),
          eq(catalogProducts.sourceId, sourceId),
          sql`${catalogProducts.id} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`,`,
          )})`,
        ),
      );
    const variants = await database
      .select()
      .from(catalogVariants)
      .where(
        and(
          eq(catalogVariants.userId, userId),
          eq(catalogVariants.sourceId, sourceId),
          sql`${catalogVariants.productId} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`,`,
          )})`,
          sql`${catalogVariants.id} IN (SELECT id FROM catalog_variants limited WHERE limited.product_id=${catalogVariants.productId} AND limited.user_id=${userId} AND limited.source_id=${sourceId} ${variantFilters("limited", filters, allowStale ? !activeSource.errorCode : healthy, allowStale)} ORDER BY external_id LIMIT 25)`,
        ),
      )
      .orderBy(asc(catalogVariants.externalId));
    const images = await database
      .select()
      .from(catalogMedia)
      .where(
        and(
          eq(catalogMedia.userId, userId),
          eq(catalogMedia.sourceId, sourceId),
          sql`${catalogMedia.productId} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`,`,
          )})`,
          sql`${catalogMedia.id} IN (SELECT id FROM catalog_media limited WHERE limited.product_id=${catalogMedia.productId} AND limited.user_id=${userId} AND limited.source_id=${sourceId} ORDER BY external_id LIMIT 50)`,
        ),
      )
      .orderBy(asc(catalogMedia.externalId));
    const collections = await database
      .select({
        productId: catalogMemberships.productId,
        id: catalogCollections.externalId,
        title: catalogCollections.title,
      })
      .from(catalogMemberships)
      .innerJoin(
        catalogCollections,
        eq(catalogCollections.id, catalogMemberships.collectionId),
      )
      .where(
        and(
          eq(catalogCollections.userId, userId),
          eq(catalogCollections.sourceId, sourceId),
          sql`${catalogMemberships.productId} IN (${sql.join(
            ids.map((id) => sql`${id}`),
            sql`,`,
          )})`,
          sql`${catalogMemberships.id} IN (SELECT id FROM catalog_memberships limited WHERE limited.product_id=${catalogMemberships.productId} ORDER BY collection_id LIMIT 50)`,
        ),
      );
    return ids.flatMap((id) => {
      const p = records.find((r) => r.id === id);
      if (!p) return [];
      const vs = variants
        .filter((v) => v.productId === id)
        .map((v) => ({
          ...v,
          availability: variantAvailability(v, {
            published:
              p.published &&
              p.status === "ACTIVE" &&
              !p.deletedAt &&
              p.complete,
            sourceHealthy: healthy,
          }),
        }));
      return [
        {
          ...p,
          freshness:
            !healthy ||
            !p.complete ||
            !vs.length ||
            vs.some((v) => v.availability === "stale")
              ? "stale"
              : "fresh",
          variants: vs,
          images: images.filter((i) => i.productId === id),
          collections: collections.filter((c) => c.productId === id),
        },
      ] as CommerceProduct[];
    });
  }
  async function searchCandidates(
    ctx: ConnectedCommerceSearchContext,
    allowStale = false,
  ): Promise<CommerceProduct[]> {
    const src = await source(ctx.userId, ctx.sourceId);
    if (
      !src?.initialSyncCompletedAt ||
      src.status === "disconnected" ||
      src.status === "permission_required"
    )
      return [];
    const terms = catalogSearchTerms(ctx.hint || ctx.query);
    const filters = ctx.filters ?? {};
    const variant = sql`EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id = ${catalogProducts.id} AND v.user_id = ${ctx.userId} AND v.source_id = ${ctx.sourceId} ${variantFilters("v", filters, !src.errorCode && (allowStale || !inventoryState(src.checkpoint).errorCode) && ["ready", "syncing"].includes(src.status), allowStale)})`;
    const where = and(
      eq(catalogProducts.userId, ctx.userId),
      eq(catalogProducts.sourceId, ctx.sourceId),
      eq(catalogProducts.status, "ACTIVE"),
      eq(catalogProducts.published, true),
      eq(catalogProducts.complete, true),
      isNull(catalogProducts.deletedAt),
      variant,
      terms
        ? sql`to_tsvector('simple',${catalogProducts.searchText}) @@ plainto_tsquery('simple',${terms})`
        : undefined,
      filters.category
        ? eq(catalogProducts.productType, filters.category)
        : undefined,
      filters.collectionId
        ? sql`EXISTS (SELECT 1 FROM catalog_memberships m JOIN catalog_collections c ON c.id=m.collection_id WHERE m.product_id=${catalogProducts.id} AND c.source_id=${ctx.sourceId} AND c.user_id=${ctx.userId} AND (c.id=${filters.collectionId} OR c.external_id=${filters.collectionId}))`
        : undefined,
    );
    const ranked = await database
      .select({ id: catalogProducts.id })
      .from(catalogProducts)
      .where(where)
      .orderBy(
        terms
          ? sql`ts_rank(to_tsvector('simple',${catalogProducts.searchText}),plainto_tsquery('simple',${terms})) DESC`
          : asc(catalogProducts.title),
        asc(catalogProducts.id),
      )
      .limit(ctx.limit);
    return products(
      ctx.userId,
      ctx.sourceId,
      ranked.map((r) => r.id),
      filters,
      allowStale,
    );
  }
  async function browse(
    userId: string,
    sourceId: string,
    input: {
      query?: string;
      cursor?: string;
      limit?: number;
      status?: string;
      category?: string;
    },
  ) {
    if (!(await source(userId, sourceId)))
      return { items: [], nextCursor: null };
    const limit = Math.max(1, Math.min(100, input.limit ?? 25));
    const terms = catalogSearchTerms(input.query ?? "");
    const rows = await database
      .select({ id: catalogProducts.id })
      .from(catalogProducts)
      .where(
        and(
          eq(catalogProducts.userId, userId),
          eq(catalogProducts.sourceId, sourceId),
          isNull(catalogProducts.deletedAt),
          input.cursor ? sql`${catalogProducts.id}>${input.cursor}` : undefined,
          input.status ? eq(catalogProducts.status, input.status) : undefined,
          input.category
            ? eq(catalogProducts.productType, input.category)
            : undefined,
          terms
            ? sql`to_tsvector('simple',${catalogProducts.searchText}) @@ plainto_tsquery('simple',${terms})`
            : undefined,
        ),
      )
      .orderBy(asc(catalogProducts.id))
      .limit(limit + 1);
    return {
      items: await products(
        userId,
        sourceId,
        rows.slice(0, limit).map((r) => r.id),
      ),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
    };
  }
  async function lookup(userId: string, sourceId: string, id: string) {
    return (await products(userId, sourceId, [id]))[0] ?? null;
  }
  const connected = createConnectedCommerceSearch({ searchCandidates });
  return {
    markInventoryActivity: (userId: string, sourceId: string) =>
      markInventoryActivity(database, userId, sourceId),
    verifyForPurchase: (userId: string, sourceId: string, ids: string[]) =>
      verifyInventoryForPurchase(database, userId, sourceId, ids, requestFor),
    async inventorySummary(userId: string, sourceId: string) {
      const currentSource = await source(userId, sourceId);
      if (!currentSource)
        return { published: 0, unverified: 0, lastVerifiedAt: null };
      const [row] = await database
        .select({
          published: sql<number>`count(*)::int`,
          unverified: sql<number>`count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id=catalog_products.id AND v.user_id=${userId} AND v.source_id=${sourceId} ${variantFilters("v", { availability: "available" }, true)}) AND (NOT catalog_products.complete OR NOT EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id=catalog_products.id AND v.user_id=${userId} AND v.source_id=${sourceId}) OR EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id=catalog_products.id AND v.user_id=${userId} AND v.source_id=${sourceId} AND NOT COALESCE((v.verified_at>NOW()-interval '15 minutes' AND v.requires_components=false AND (v.available_for_sale IS NOT NULL AND v.tracked=true AND v.inventory_policy='DENY' AND v.quantity<=0)),false))))::int`,
        })
        .from(catalogProducts)
        .where(
          and(
            eq(catalogProducts.userId, userId),
            eq(catalogProducts.sourceId, sourceId),
            eq(catalogProducts.status, "ACTIVE"),
            eq(catalogProducts.published, true),
            isNull(catalogProducts.deletedAt),
          ),
        );
      const [latest] = await database
        .select({ at: sql<Date | null>`max(${catalogVariants.verifiedAt})` })
        .from(catalogVariants)
        .where(
          and(
            eq(catalogVariants.userId, userId),
            eq(catalogVariants.sourceId, sourceId),
          ),
        );
      return {
        ...row,
        unverified:
          currentSource.errorCode ||
          inventoryState(currentSource.checkpoint).errorCode
            ? row.published
            : row.unverified,
        lastVerifiedAt: latest?.at ?? null,
      };
    },
    /** Discovery only: require verifyForPurchase before recommending or claiming current stock. */
    purchaseCandidates: createConnectedCommerceSearch({
      searchCandidates: (ctx) => searchCandidates(ctx, true),
    }).searchCandidates,
    source,
    products,
    browse,
    searchCandidates: connected.searchCandidates,
    lookup,
    async variantPage(
      userId: string,
      sourceId: string,
      productId: string,
      cursor?: string,
    ) {
      const product = await lookup(userId, sourceId, productId);
      if (!product) return null;
      const src = await source(userId, sourceId);
      const rows = await database
        .select()
        .from(catalogVariants)
        .where(
          and(
            eq(catalogVariants.userId, userId),
            eq(catalogVariants.sourceId, sourceId),
            eq(catalogVariants.productId, productId),
            cursor ? sql`${catalogVariants.externalId}>${cursor}` : undefined,
          ),
        )
        .orderBy(asc(catalogVariants.externalId))
        .limit(26);
      return {
        items: rows.slice(0, 25).map((v) => ({
          ...v,
          availability: variantAvailability(v, {
            published:
              product.published &&
              product.status === "ACTIVE" &&
              !!(product as any).complete &&
              !(product as any).deletedAt,
            sourceHealthy:
              !!src &&
              !src.errorCode &&
              !inventoryState(src.checkpoint).errorCode &&
              ["ready", "syncing"].includes(src.status),
          }),
        })),
        nextCursor: rows.length > 25 ? rows[24].externalId : null,
      };
    },
    async lookupVariant(
      userId: string,
      sourceId: string,
      productId: string,
      variantId: string,
    ) {
      if (!(await source(userId, sourceId))) return null;
      const [v] = await database
        .select()
        .from(catalogVariants)
        .where(
          and(
            eq(catalogVariants.userId, userId),
            eq(catalogVariants.sourceId, sourceId),
            eq(catalogVariants.productId, productId),
            sql`(${catalogVariants.id}=${variantId} OR ${catalogVariants.externalId}=${variantId})`,
          ),
        )
        .limit(1);
      return v ?? null;
    },
    async annotate(
      userId: string,
      sourceId: string,
      id: string,
      input: {
        aiGuidance?: string | null;
        notes?: string | null;
        merchantTags?: string[];
      },
    ) {
      if (!(await source(userId, sourceId))) return false;
      const safe = commerceAnnotationSchema.parse(input);
      const [p] = await database
        .update(catalogProducts)
        .set(safe)
        .where(
          and(
            eq(catalogProducts.id, id),
            eq(catalogProducts.userId, userId),
            eq(catalogProducts.sourceId, sourceId),
          ),
        )
        .returning({ id: catalogProducts.id });
      return !!p;
    },
    async eligibleCount(userId: string, sourceId: string) {
      const src = await source(userId, sourceId);
      if (
        !src?.initialSyncCompletedAt ||
        !Array.isArray(src.grantedScopes) ||
        !src.grantedScopes.includes("read_products") ||
        !["ready", "syncing"].includes(src.status) ||
        src.errorCode ||
        inventoryState(src.checkpoint).errorCode
      )
        return 0;
      const [row] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(catalogProducts)
        .where(
          and(
            eq(catalogProducts.userId, userId),
            eq(catalogProducts.sourceId, sourceId),
            eq(catalogProducts.complete, true),
            eq(catalogProducts.status, "ACTIVE"),
            eq(catalogProducts.published, true),
            isNull(catalogProducts.deletedAt),
            sql`EXISTS (SELECT 1 FROM catalog_variants v WHERE v.product_id=${catalogProducts.id} AND v.user_id=${userId} AND v.source_id=${sourceId} AND v.price IS NOT NULL AND v.currency=${src.currency} ${variantFilters("v", { availability: "available" }, true)})`,
          ),
        );
      return row?.count ?? 0;
    },
  };
}

export type InventorySummary = Awaited<
  ReturnType<ReturnType<typeof createCommerceStore>["inventorySummary"]>
>;
