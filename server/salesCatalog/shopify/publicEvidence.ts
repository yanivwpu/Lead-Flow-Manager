/** Read-only, bounded Shopify storefront-public product attributes.
 * Admin may expose PRIVATE metafields: never store or expose them to AI.
 * Taxonomy category and strictly typed PUBLIC_READ numeric measurements only.
 */
import type { CatalogRequest } from "./api";

export type PublicProductEvidence = {
  source: "shopify_category" | "shopify_metafield";
  key: string;
  text: string;
};
export const SHOPIFY_PUBLIC_EVIDENCE_QUERY = `query CatalogPublicEvidence($id:ID!,$after:String) {
  product(id:$id) {
    id
    category { fullName }
    metafields(first:25,after:$after) {
      nodes { namespace key type value definition { access { storefront } } }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;
/** Free-form metafields and SEO copy are NOT auto-approved customer knowledge.
 * Shopify PUBLIC_READ means storefront-accessible, not advice/PII-safe. Only
 * bounded structured measurements with known field semantics become evidence.
 * Free-form content must use the existing AI Brain review/publish path.
 */
const NUMERIC_KEYS = /^(?:length|width|height|depth|thickness|diameter|weight|capacity|volume|size|wattage|power|flex_rating|rating)$/i;
const MEASURE_TYPES = new Set(["weight","dimension","volume"]);
const UNITS = new Set(["G","KG","LB","OZ","MM","CM","M","IN","FT","ML","L","GAL"]);
const SENSITIVE_KEY = /(?:^|_)(?:pin|code|cost|margin|wholesale|supplier|password|token|secret|private|internal|staff|employee|customer|discount|api|credential)(?:_|$)/i;
const LABEL_KEY = /^[a-z0-9_]{1,80}$/i;
const sanitize = (raw: unknown, max = 160): string => typeof raw === "string" ?
  raw.replace(/<[^>]*>/g," ").replace(/[\\u0000-\\u001f\\u007f\\u202a-\\u202e\\u2066-\\u2069]/g," ")
    .replace(/\\s+/g," ").trim().slice(0,max) : "";
function publicMetafield(raw: any): PublicProductEvidence | null {
  if (!raw || raw.definition?.access?.storefront !== "PUBLIC_READ" ||
      !LABEL_KEY.test(raw.namespace) || /^(?:app|private|internal|admin|wholesale)/i.test(raw.namespace) ||
      !LABEL_KEY.test(raw.key) || !NUMERIC_KEYS.test(raw.key) || SENSITIVE_KEY.test(raw.key)) return null;
  let display = "";
  if (raw.type === "number_integer" || raw.type === "number_decimal") {
    if(typeof raw.value !== "string" || !/^(?:0|[1-9]\\d{0,6})(?:\\.\\d{1,4})?$/.test(raw.value))return null;
    display = raw.value;
  } else if (MEASURE_TYPES.has(raw.type)) {
    let measurement:any;
    try { measurement=JSON.parse(raw.value); } catch { return null; }
    if (typeof measurement?.value !== "number" || !Number.isFinite(measurement.value) ||
      measurement.value < 0 || measurement.value > 1e7 || typeof measurement.unit !== "string" ||
      !UNITS.has(measurement.unit.toUpperCase()))return null;
    display = `${measurement.value} ${measurement.unit.toUpperCase()}`;
  } else return null;
  return {source:"shopify_metafield",key:raw.key,text:`${raw.key.replace(/_/g," ")}: ${display}`};
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
