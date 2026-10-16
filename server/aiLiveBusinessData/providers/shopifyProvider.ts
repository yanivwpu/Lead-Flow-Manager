import { db } from "../../../drizzle/db";
import { salesCatalog } from "../../salesCatalog";
import { catalogReadiness } from "../../salesCatalog/shopify/readiness";
import { type CommerceFilters } from "@shared/commerceCatalog";
import type {
  LiveBusinessDataProvider,
  LiveBusinessDataQueryContext,
} from "../types";
// Decimal comparison without rounding provider prices through binary floating point.
function atMost(actual: string, bound: string) {
  const [whole, fraction = ""] = actual.split("."),
    [limit, limitFraction = ""] = bound.split(".");
  const a = whole.replace(/^0+(?=\d)/, ""),
    b = limit.replace(/^0+(?=\d)/, "");
  if (a.length !== b.length) return a.length < b.length;
  if (a !== b) return a < b;
  const digits = Math.max(fraction.length, limitFraction.length);
  return fraction.padEnd(digits, "0") <= limitFraction.padEnd(digits, "0");
}
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
            ? `${ready.eligibleProductCount} verified available snapshots / ${ready.publishedProductCount} published · ${ready.freshness === "fresh" ? "Catalog ready" : "Inventory freshness unverified"}`
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
      await store.markInventoryActivity(ctx.userId, source.id);
      const budget = ctx.message.match(
        /\b(?:under|below|less than|hasta|menos de)\s*[$€£₪]?\s*(\d+(?:\.\d+)?)/i,
      );
      const recommendation =
        /\b(?:recommend\w*|buy|purchase|available|availability|in stock|comprar|disponib\w*|recomiend\w*|recomend\w*)\b|המלצ|ממליצ|לקנות|לרכוש|במלאי|זמין/iu.test(
          ctx.message,
        );
      if (recommendation && !source.currency) return [];
      const filters: CommerceFilters = {
        ...(recommendation
          ? {
              availability: "available" as const,
              minPrice: "0",
              currency: source.currency!,
            }
          : {}),
        ...(budget
          ? {
              maxPrice: budget[1],
              ...(source.currency ? { currency: source.currency } : {}),
            }
          : {}),
      };
      const products = await (
        recommendation ? store.purchaseCandidates : store.searchCandidates
      )(ctx.userId, {
        sourceId: source.id,
        query: ctx.message.slice(0, 200) || "products",
        hint: ctx.hint?.slice(0, 160),
        limit: Math.max(1, Math.min(8, ctx.limit ?? 8)),
        filters,
      });
      // Stale snapshots may discover candidates, but never authorize a purchase recommendation.
      const candidates = products
        .flatMap((p) => p.variants.slice(0, 3).map((v) => ({ p, v })))
        .slice(0, Math.min(8, ctx.limit ?? 8));
      const live = recommendation
        ? await store.verifyForPurchase(
            ctx.userId,
            source.id,
            candidates.map((c) => c.v.id),
          )
        : [];
      const verified = new Map(
        live
          .filter(
            (v) =>
              ["available", "not_tracked"].includes(v.availability) &&
              v.variant.price !== null &&
              v.variant.currency === source.currency &&
              (!budget || atMost(v.variant.price, budget[1])),
          )
          .map((v) => [v.variant.id, v]),
      );
      const records = products.flatMap((p) =>
        p.variants.slice(0, 3).flatMap((snapshot) => {
          const current = verified.get(snapshot.id);
          if (recommendation && !current) return [];
          const v = current
            ? { ...current.variant, availability: current.availability }
            : snapshot;
          const product = current?.product ?? p;
          const summary = `${product.title} / ${v.title} | Description: ${p.description.slice(0, 400)} | SKU: ${v.sku ?? "not configured"} | Price: ${v.price !== null && v.currency ? `${v.currency} ${v.price}` : "unknown"} | Availability: ${v.availability} (provider snapshot ${new Date(v.verifiedAt).toISOString()}; verify again before any purchase) | Product URL: ${product.productUrl ?? "not configured"} | Images: ${
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
              displayName: `${product.title} / ${v.title}`,
              price: v.price,
              currency: v.currency,
              availability: v.availability,
              freshness: current ? "fresh" : p.freshness,
              purchaseVerified: !!current,
              productUrl: product.productUrl,
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

