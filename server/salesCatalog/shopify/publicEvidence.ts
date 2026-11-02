/** Read-only, bounded Shopify storefront-public product attributes.
 * Admin may expose PRIVATE metafields: never store or expose them to AI.
 * Public SEO/category and explicit PUBLIC_READ metafield definitions only.
 */
import type { CatalogRequest } from "./api";

export type PublicProductEvidence = {
  source: "shopify_category" | "shopify_seo" | "shopify_metafield";
  key: string;
  text: string;
};
export const SHOPIFY_PUBLIC_EVIDENCE_QUERY = `query CatalogPublicEvidence($id:ID!,$after:String) {
  product(id:$id) {
    id
    category { fullName }
    seo { title description }
    metafields(first:25,after:$after) {
      nodes { namespace key type value definition { access { storefront } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
const ALLOWED_TYPES = new Set([
  "single_line_text_field", "multi_line_text_field", "number_integer",
  "number_decimal", "boolean", "weight", "dimension", "volume",
  "list.single_line_text_field"
]);
const SENSITIVE_KEY = /(?:^|_)(?:cost|margin|wholesale|supplier|vendor_cost|password|token|secret|private|internal|staff|employee|customer|discount_code|api|credential)(?:_|$)/i;
const LABEL_KEY = /^[a-z0-9_]{1,80}$/i;
const sanitize = (raw: unknown, max = 360): string => typeof raw === "string" ?
  raw.replace(/<[^>]*>/g, " ").replace(/https?:\/\/\S+/gi, " ")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, max) : "";
function publicMetafield(raw: any): PublicProductEvidence | null {
  if (!raw || raw.definition?.access?.storefront !== "PUBLIC_READ" ||
    !LABEL_KEY.test(raw.namespace) || /^(?:app|private|internal|admin|wholesale)/i.test(raw.namespace) || !LABEL_KEY.test(raw.key) ||
    SENSITIVE_KEY.test(raw.key) || !ALLOWED_TYPES.has(raw.type)) return null;
  let value: unknown = raw.value;
  if (raw.type === "list.single_line_text_field") {
    try { const list = JSON.parse(raw.value); value = Array.isArray(list) ?
      list.filter((v):v is string => typeof v === "string").slice(0,12).join(", ") : ""; }
    catch { return null; }
  }
  if (["weight","dimension","volume"].includes(raw.type)) {
    try { const unit = JSON.parse(raw.value);
      value = typeof unit?.value === "number" && typeof unit?.unit === "string" ?
        `${unit.value} ${unit.unit}` : ""; }
    catch { return null; }
  }
  const clean = sanitize(value);
  if (!clean || /(?:ignore (?:all|previous) instructions|system prompt|developer instruction)/i.test(clean)) return null;
  return { source: "shopify_metafield", key: raw.key, text: `${raw.key.replace(/_/g, " ")}: ${clean}` };
}
/** Sanitized output only. Paginate at most 3 x 25 attributes per product. */
export async function readShopifyPublicEvidence(request: CatalogRequest, productId: string): Promise<PublicProductEvidence[]> {
  const result: PublicProductEvidence[] = [];
  const visited = new Set<string>();
  let cursor: string | null = null;
  for (let page=0;page<3;page++) {
    const response = await request(SHOPIFY_PUBLIC_EVIDENCE_QUERY,{id:productId,after:cursor});
    const item = response?.product;
    if (!item || item.id !== productId || !Array.isArray(item.metafields?.nodes) ||
      item.metafields.nodes.length > 25 || typeof item.metafields.pageInfo?.hasNextPage !== "boolean") throw new Error("invalid_public_attributes");
    if (page === 0) {
      const category = sanitize(item.category?.fullName,160);
      if(category)result.push({source:"shopify_category",key:"category",text:`Category: ${category}`});
      const seo = sanitize(item.seo?.description,360);
      if(seo && !/(?:ignore (?:all|previous) instructions|system prompt)/i.test(seo))
        result.push({source:"shopify_seo",key:"description",text:`Product page summary: ${seo}`});
    }
    for(const mf of item.metafields.nodes) {
      const allowed=publicMetafield(mf);
      if(allowed && !visited.has(allowed.key)){visited.add(allowed.key);result.push(allowed);}
    }
    if (!item.metafields.pageInfo.hasNextPage)break;
    const next=item.metafields.pageInfo.endCursor;
    if (typeof next !== "string" || !next || next === cursor) throw new Error("invalid_public_attributes_cursor");
    cursor=next;
  }
  return result.slice(0,60);
}
