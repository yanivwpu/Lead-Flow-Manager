/** Server-only contracts. Provider identities are resolved from the owned catalog, never a request body. */
export type VerifiedCheckoutItem = {
  productId: string;
  variantId: string;
  quantity: number;
  price: string;
  currency: string;
  options: Array<{ name: string; value: string }>;
  // Server-only proof from the owned Admin inventory verifier, never from browser/model input.
  inventoryProof?: { at: number; quantity: number | null; unrestricted: boolean };
};
export type CheckoutReceipt = {
  checkoutUrl: string;
  providerCartId: string;
  paymentStatus: "unknown";
};
export interface CommerceCheckoutProvider {
  verify(item: VerifiedCheckoutItem): Promise<void>;
  prepare(item: VerifiedCheckoutItem): Promise<CheckoutReceipt>;
  // Cart existence does not establish an order/payment status.
  status?: (receipt: CheckoutReceipt, item?: VerifiedCheckoutItem) => Promise<"available" | "expired" | "unknown">;
}
// Finite diagnostic vocabulary; never carry provider text, statusText, Location or URLs.
export const CHECKOUT_FAILURE_DETAILS = [
  'api_version_mismatch','graphql_error','invalid_json','html_response',
  'request_timeout','connect_timeout','headers_timeout','dns_failure','tls_failure',
  'connection_failure','redirect_refused','transport_unknown_before_headers',
  'body_timeout','body_transport_failed',
  'http_400','http_401','http_403','http_404','http_405','http_408','http_410','http_423','http_430',
  'http_500','http_502','http_503','http_504','http_redirect','http_other',
  'item_invalid','inventory_proof_missing','inventory_proof_expired','inventory_proof_insufficient',
  'variant_not_accessible','variant_identity_mismatch','variant_not_for_sale','variant_unsupported',
  'storefront_inventory_insufficient','quantity_rule_rejected',
] as const;
export type CheckoutFailureDetail = typeof CHECKOUT_FAILURE_DETAILS[number];
export class CheckoutError extends Error {
  constructor(public code: "setup_required" | "not_confirmed" | "unavailable" | "changed" | "invalid_response" | "throttled" | "ambiguous" | "already_preparing" | "expired", public retryMs = 30_000, public detail?: CheckoutFailureDetail) {
    super(code); // Never include provider messages, bodies, URLs or tokens.
  }
}
