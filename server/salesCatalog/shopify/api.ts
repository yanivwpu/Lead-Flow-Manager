import { getShopifyApi } from "../../shopify";
import { boundedRequest } from "../../shopifyWebhookHealthAudit";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
export class CatalogApiError extends Error {
  constructor(
    public code:
      | "throttled"
      | "access_denied"
      | "unavailable"
      | "invalid_response",
    public retryMs = 30_000,
  ) {
    super(code);
  }
}
export type CatalogRequest = (
  query: string,
  variables?: Record<string, unknown>,
) => Promise<any>;
export function shopifyCatalogRequest(
  shop: string,
  token: string,
): CatalogRequest {
  const normalized = normalizeShopifyShopDomain(shop);
  const api = getShopifyApi();
  if (!normalized || !token || !api) throw new CatalogApiError("unavailable");
  const client = new api.clients.Graphql({
    session: { shop: normalized, accessToken: token } as any,
  });
  return createCatalogRequest(client);
}
export function createCatalogRequest(client: {
  request(query: string, options?: any): Promise<any>;
}): CatalogRequest {
  return async (query, variables) => {
    try {
      const response = await boundedRequest(
        {
          request: async (q, options) => {
            const response = await client.request(q, options);
            if (response?.errors)
              throw classifyApiError({ body: { errors: response.errors } });
            return response;
          },
        },
        query,
        {
          variables,
          retries: 0,
        },
      );
      const throttle = response.extensions?.cost?.throttleStatus;
      return { ...response.data, __throttle: throttle };
    } catch (error: any) {
      if (error instanceof CatalogApiError) throw error;
      throw classifyApiError(error);
    }
  };
}
function classifyApiError(error: any): CatalogApiError {
  const raw =
    error?.response?.errors?.graphQLErrors ?? error?.body?.errors ?? [];
  const codes = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.graphQLErrors)
      ? raw.graphQLErrors
      : [];
  const status =
    error?.response?.code ?? error?.response?.status ?? error?.status;
  if (
    status === 429 ||
    codes.some((e: any) => e.extensions?.code === "THROTTLED")
  )
    return new CatalogApiError("throttled", 60_000);
  if (
    status === 401 ||
    status === 403 ||
    codes.some((e: any) => e.extensions?.code === "ACCESS_DENIED")
  )
    return new CatalogApiError("access_denied", 600_000);
  return new CatalogApiError(codes.length ? "invalid_response" : "unavailable");
}
export const SHOPIFY_CATALOG_META_QUERY = `query CatalogMeta { currentAppInstallation { accessScopes { handle } } shop { currencyCode myshopifyDomain primaryDomain { host } } }`;
export const SHOPIFY_CATALOG_IDS_QUERY = `query CatalogIds($after:String) { products(first:50,after:$after,sortKey:ID) { nodes { id } pageInfo { hasNextPage endCursor } } }`;
export const SHOPIFY_CATALOG_PRODUCT_QUERY = `query CatalogProduct($id:ID!,$variants:String,$media:String,$collections:String,$includeVariants:Boolean! = true,$includeMedia:Boolean! = true,$includeCollections:Boolean! = true) {
 product(id:$id) { id title description productType vendor status publishedAt onlineStoreUrl updatedAt tags requiresSellingPlan
 options { name values } variantsCount { count }
 variants(first:50,after:$variants) @include(if:$includeVariants) { nodes { id title sku selectedOptions { name value } price compareAtPrice inventoryPolicy inventoryQuantity sellableOnlineQuantity availableForSale requiresComponents updatedAt inventoryItem { id tracked } } pageInfo { hasNextPage endCursor } }
 media(first:50,after:$media) @include(if:$includeMedia) { nodes { id ... on MediaImage { image { url altText } } } pageInfo { hasNextPage endCursor } }
 collections(first:50,after:$collections) @include(if:$includeCollections) { nodes { id title } pageInfo { hasNextPage endCursor } }
 }
}`;
export const SHOPIFY_CATALOG_VERIFY_VARIANT_QUERY = `query VerifyCatalogVariant($id:ID!) { productVariant(id:$id) { id title price compareAtPrice inventoryPolicy inventoryQuantity availableForSale requiresComponents updatedAt inventoryItem { id tracked } product { id status publishedAt onlineStoreUrl requiresSellingPlan } } shop { currencyCode } }`;
export function readConnection(raw: any): {
  nodes: any[];
  cursor: string | null;
} {
  if (
    !raw ||
    !Array.isArray(raw.nodes) ||
    raw.nodes.length > 50 ||
    typeof raw.pageInfo?.hasNextPage !== "boolean"
  )
    throw new CatalogApiError("invalid_response");
  const cursor = raw.pageInfo.hasNextPage ? raw.pageInfo.endCursor : null;
  if (cursor !== null && (typeof cursor !== "string" || !cursor))
    throw new CatalogApiError("invalid_response");
  return { nodes: raw.nodes, cursor };
}
export function decimalPrice(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string" || !/^\d+(\.\d+)?$/.test(value))
    throw new CatalogApiError("invalid_response");
  return value;
}
