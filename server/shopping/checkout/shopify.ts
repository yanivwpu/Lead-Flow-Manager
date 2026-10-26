import { transportDetail } from "./storefrontDiagnostics";
import { normalizeShopifyShopDomain } from "@shared/shopifyBilling";
import { compareMoney } from "@shared/shoppingAssistant";
import { CheckoutError, type CommerceCheckoutProvider, type VerifiedCheckoutItem, type CheckoutReceipt } from "./contract";
export const STOREFRONT_API_VERSION = "2026-10";
export type StorefrontCredential = { kind: "public" | "private"; token: string } | { kind: "tokenless" };
const gid = (kind: string, value: unknown) => typeof value === "string" && new RegExp(`^gid://shopify/${kind}/[1-9][0-9]*$`).test(value);
const money = (v: unknown): v is string => typeof v === "string" && /^\d+(?:\.\d{1,6})?$/.test(v);
export function validateCheckoutUrl(raw: unknown, shop: string, attestedHost?:string): string {
  try {
    if (typeof raw !== "string" || raw.length > 4096) throw Error();
    const u = new URL(raw);
    // A custom host must come from a live, owned Admin shop.primaryDomain query.
    if (u.protocol !== "https:" || ![normalizeShopifyShopDomain(shop),attestedHost].includes(u.hostname) || u.port || u.username || u.password || u.hash || !/^\/(?:cart\/c\/|checkouts\/)[A-Za-z0-9_-]+(?:\/|$)/.test(u.pathname)) throw Error();
    // Do not allow redirect/return destinations hidden in an otherwise trusted URL.
    for (const key of u.searchParams.keys()) if (key !== "key") throw Error();
    return u.href;
  } catch { throw new CheckoutError("invalid_response"); }
}
// Audited against the 2026-10 field reference; see docs/shopify-checkout-phase2b-handoff.md.
// Keep token-only inventory out of the tokenless document, rather than removing fields by string replacement.
const VERIFY_FIELDS = `id availableForSale quantityRule { minimum maximum increment } requiresComponents selectedOptions { name value } price { amount currencyCode } product { id requiresSellingPlan }`;
const VERIFY_TOKENLESS = `query CheckoutVariant($id:ID!) { node(id:$id) { ... on ProductVariant { ${VERIFY_FIELDS} } } }`;
const VERIFY = `query CheckoutVariant($id:ID!) { node(id:$id) { ... on ProductVariant { ${VERIFY_FIELDS} quantityAvailable currentlyNotInStock } } }`;
const CART_FIELDS = `id checkoutUrl totalQuantity lines(first:2) { nodes { quantity merchandise { ... on ProductVariant { id product { id } } } cost { amountPerQuantity { amount currencyCode } } } }`;
const CREATE = `mutation PrepareCheckout($input:CartInput!) { cartCreate(input:$input) { cart { ${CART_FIELDS} } userErrors { code } warnings { code } } }`;
const STATUS = `query CheckoutStatus($id:ID!) { cart(id:$id) { ${CART_FIELDS} } }`;
/** No Admin token, no automatic retry, no redirects, bounded timeout, bounded diagnostics. */
export function createShopifyCheckoutProvider(config: { shop: string; credential: StorefrontCredential; attestedCheckoutHost?:string; fetch?: typeof fetch }): CommerceCheckoutProvider {
  const shop = normalizeShopifyShopDomain(config.shop);
  if (!shop || !config.credential || (config.credential.kind !== "tokenless" && (!config.credential.token || !["public", "private"].includes(config.credential.kind)))) throw new CheckoutError("setup_required");
  const requestFetch = config.fetch ?? fetch;
  let nextRequestAt = 0;
  async function request(query: string, variables: Record<string, unknown>, mutation = false): Promise<any> {
    if (Date.now() < nextRequestAt) throw new CheckoutError("throttled", nextRequestAt - Date.now());
    let response: Response;
    const signal = AbortSignal.timeout(15_000);
    try {
      response = await requestFetch(`https://${shop}/api/${STOREFRONT_API_VERSION}/graphql.json`, {
        method: "POST", redirect: "error", signal,
        headers: { "Content-Type": "application/json", ...(config.credential.kind === "tokenless" ? {} : { [config.credential.kind === "private" ? "Shopify-Storefront-Private-Token" : "X-Shopify-Storefront-Access-Token"]: config.credential.token }) },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) { throw new CheckoutError(mutation ? "ambiguous" : "unavailable",30_000,signal.aborted ? "transport_timeout" : transportDetail(error)); }
    if (response.status === 429) {
      const delay = Number(response.headers.get("retry-after"));
      const retryMs = Number.isFinite(delay) && delay > 0 ? Math.min(delay * 1000, 600_000) : 60_000;
      nextRequestAt = Date.now() + retryMs;
      throw new CheckoutError("throttled", retryMs);
    }
    if ([401,403].includes(response.status)) throw new CheckoutError("setup_required",600_000);
    if (!response.ok) throw new CheckoutError(mutation ? "ambiguous" : "unavailable",30_000,
      response.status>=300 && response.status<400 ? "http_redirect" :
      response.status>=500 && response.status<600 ? "http_server_error" :
      response.status>=400 && response.status<500 ? "http_client_error" : "http_unexpected_status");
    const html = /^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "");
    if (response.headers.get("x-shopify-api-version") !== STOREFRONT_API_VERSION) throw new CheckoutError(mutation ? "ambiguous" : "invalid_response",30_000,html ? "http_html_response" : "api_version_mismatch");
    let body: any;
    try { body = await response.json(); } catch (error) { throw new CheckoutError(mutation ? "ambiguous" : "invalid_response",30_000,
      signal.aborted || transportDetail(error)==="transport_timeout" ? "response_body_timeout" :
      error instanceof SyntaxError ? (html ? "http_html_response" : "invalid_json") : "response_body_read_failed"); }
    if (body?.errors?.length) {
      if (!body.data && body.errors.every((e:any)=>e?.extensions?.code === "THROTTLED")) { nextRequestAt=Date.now()+60_000; throw new CheckoutError("throttled",60_000); }
      throw new CheckoutError(mutation ? "ambiguous" : "invalid_response",30_000,"graphql_error");
    }
    if (!body?.data) throw new CheckoutError(mutation ? "ambiguous" : "invalid_response",30_000,"missing_data");
    return body.data;
  }
  function validateItem(item: VerifiedCheckoutItem) {
    if (!gid("Product",item.productId) || !gid("ProductVariant",item.variantId) || !Number.isInteger(item.quantity) || item.quantity<1 || item.quantity>99 || !money(item.price) || !/^[A-Z]{3}$/.test(item.currency)) throw new CheckoutError("unavailable");
  }
  function receipt(cart: any, item?: VerifiedCheckoutItem): CheckoutReceipt {
    if (typeof cart?.id !== "string" || !cart.id.startsWith("gid://shopify/Cart/")) throw new CheckoutError("invalid_response");
    const checkoutUrl=validateCheckoutUrl(cart.checkoutUrl, shop!, config.attestedCheckoutHost);
    if(item) {
      const lines=cart.lines?.nodes, l=lines?.[0], amount=l?.cost?.amountPerQuantity;
      if (!Array.isArray(lines) || lines.length!==1 || cart.totalQuantity!==item.quantity || l.quantity!==item.quantity || l.merchandise?.id!==item.variantId || l.merchandise?.product?.id!==item.productId || !money(amount?.amount) || amount.currencyCode!==item.currency || compareMoney(amount.amount,item.price)!==0) throw new CheckoutError("changed");
    }
    return {checkoutUrl,providerCartId:cart.id,paymentStatus:"unknown"};
  }
  const provider: CommerceCheckoutProvider = {
    async verify(item) {
      validateItem(item);
      const tokenless = config.credential.kind === "tokenless";
      if (tokenless) {
        const proof = item.inventoryProof, age = Date.now() - (proof?.at ?? 0);
        if (!proof || !Number.isFinite(age) || age < 0 || age > 60_000 || (!proof.unrestricted && (!Number.isInteger(proof.quantity) || proof.quantity! < item.quantity))) throw new CheckoutError("unavailable",30_000,"inventory_proof_invalid");
      }
      const v=(await request(tokenless ? VERIFY_TOKENLESS : VERIFY,{id:item.variantId})).node;
      if(!v) throw new CheckoutError("unavailable",30_000,"variant_not_visible");
      if(v.id!==item.variantId || v.product?.id!==item.productId) throw new CheckoutError("unavailable",30_000,"variant_identity_mismatch");
      if(v.availableForSale!==true || (!tokenless && v.currentlyNotInStock!==true && (!Number.isInteger(v.quantityAvailable) || v.quantityAvailable<item.quantity))) throw new CheckoutError("unavailable",30_000,"variant_unavailable");
      if(v.requiresComponents!==false || v.product.requiresSellingPlan!==false) throw new CheckoutError("unavailable",30_000,"unsupported_variant");
      const rule=v.quantityRule;
      if(!rule || !Number.isInteger(rule.minimum) || rule.minimum<1 || !Number.isInteger(rule.increment) || rule.increment<1 || (rule.maximum!==null && (!Number.isInteger(rule.maximum)||rule.maximum<rule.minimum))) throw new CheckoutError("unavailable",30_000,"quantity_rule_invalid");
      if(item.quantity<rule.minimum || (rule.maximum!==null && item.quantity>rule.maximum) || item.quantity%rule.increment!==0) throw new CheckoutError("unavailable",30_000,"quantity_rule_rejected");
      if(!money(v.price?.amount) || v.price.currencyCode!==item.currency || compareMoney(v.price.amount,item.price)!==0 || JSON.stringify(v.selectedOptions)!==JSON.stringify(item.options)) throw new CheckoutError("changed");
      return {quantityRule:{minimum:rule.minimum,maximum:rule.maximum,increment:rule.increment}};
    },
    async prepare(item) {
      await provider.verify(item);
      const data=await request(CREATE,{input:{lines:[{merchandiseId:item.variantId,quantity:item.quantity}]}},true);
      const payload=data.cartCreate;
      if (!Array.isArray(payload?.userErrors) || !Array.isArray(payload?.warnings)) throw new CheckoutError("ambiguous");
      if (payload.userErrors.length || payload.warnings.length) throw new CheckoutError(payload.cart ? "ambiguous" : "unavailable");
      return receipt(payload.cart,item);
    },
    async status(previous, item) {
      validateCheckoutUrl(previous.checkoutUrl,shop!,config.attestedCheckoutHost);
      const data=await request(STATUS,{id:previous.providerCartId});
      if(data.cart===null)return "expired";
      const current=receipt(data.cart,item);
      return current.providerCartId===previous.providerCartId && current.checkoutUrl===previous.checkoutUrl ? "available" : "unknown";
    },
  };
  return provider;
}

