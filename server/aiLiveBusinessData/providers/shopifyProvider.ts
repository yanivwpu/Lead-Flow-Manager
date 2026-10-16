import { db } from "../../../drizzle/db";
import { salesCatalog } from "../../salesCatalog";
import { catalogReadiness } from "../../salesCatalog/shopify/readiness";
import { type CommerceFilters } from "@shared/commerceCatalog";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataQueryContext,
} from "../types";
export function createShopifyLiveProvider(
  store = salesCatalog.commerce,
  readiness = (userId: string) => catalogReadiness(db, store, userId),
): LiveBusinessDataProvider {
  return {
    id: "shopify",
    async getStatus(userId) {
      try {
        const ready = await readiness(userId);
        return {
          status:
            ready.connection === "disconnected"
              ? "disconnected"
              : ready.searchReady
                ? "connected"
                : ready.status === "error"
                  ? "error"
                  : "coming_soon",
          detail: ready.searchReady
            ? `${ready.eligibleProductCount} products · ${ready.freshness === "fresh" ? "Catalog ready" : "Inventory freshness unverified"}`
            : ready.status === "permission_required"
              ? "Approve Product Access"
              : ready.status === "syncing"
                ? "Syncing products"
                : "Catalog unavailable",
          catalogReadiness: {
            connection: ready.connection as "connected" | "disconnected",
            catalog: ready.searchReady
              ? ready.freshness === "fresh"
                ? "ready"
                : "stale"
              : ready.status === "permission_required"
                ? "permission_required"
                : "syncing",
          },
        };
      } catch {
        return { status: "error", detail: "Catalog unavailable" };
      }
    },
    async query(ctx: LiveBusinessDataQueryContext) {
      const source = await store.source(ctx.userId);
      if (!source) return [];
      const budget = ctx.message.match(
        /\b(?:under|below|less than|hasta|menos de)\s*[$€£₪]?\s*(\d+(?:\.\d+)?)/i,
      );
      const recommendation =
        /\brecommend\w*\b|\brecomiend\w*\b|\brecomend\w*\b|המלצ|ממליצ/iu.test(
          ctx.message,
        );
      const filters: CommerceFilters = {
        ...(recommendation ? { availability: "available" as const } : {}),
        ...(budget
          ? {
              maxPrice: budget[1],
              ...(source.currency ? { currency: source.currency } : {}),
            }
          : {}),
      };
      const products = await store.searchCandidates(ctx.userId, {
        sourceId: source.id,
        query: ctx.message.slice(0, 200) || "products",
        hint: ctx.hint?.slice(0, 160),
        limit: Math.max(1, Math.min(8, ctx.limit ?? 8)),
        filters,
      });
      const records = products.flatMap((p) =>
        p.variants.slice(0, 3).map((v) => {
          const summary = `${p.title} / ${v.title} | Description: ${p.description.slice(0, 400)} | SKU: ${v.sku ?? "not configured"} | Price: ${v.price !== null && v.currency ? `${v.currency} ${v.price}` : "unknown"} | Availability: ${v.availability} (provider snapshot ${new Date(v.verifiedAt).toISOString()}; verify again before any purchase) | Product URL: ${p.productUrl ?? "not configured"} | Images: ${
            p.images
              .slice(0, 3)
              .map((i) => i.url)
              .join("; ") || "not configured"
          }${p.aiGuidance ? ` | Merchant guidance: ${p.aiGuidance}` : ""}`;
          return {
            providerId: "shopify" as const,
            recordType: "product_variant",
            summary,
            data: {
              productId: p.id,
              variantId: v.id,
              externalProductId: p.externalId,
              externalVariantId: v.externalId,
              displayName: `${p.title} / ${v.title}`,
              price: v.price,
              currency: v.currency,
              availability: v.availability,
              freshness: p.freshness,
              productUrl: p.productUrl,
              images: p.images.slice(0, 3),
              options: v.options,
              active: true,
            },
          };
        }),
      );
      return records.slice(0, Math.min(8, ctx.limit ?? 8));
    },
  };
}
export const shopifyProvider = createShopifyLiveProvider();
