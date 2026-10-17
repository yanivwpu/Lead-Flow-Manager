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
export class CheckoutError extends Error {
  constructor(public code: "setup_required" | "not_confirmed" | "unavailable" | "changed" | "invalid_response" | "throttled" | "ambiguous" | "already_preparing" | "expired", public retryMs = 30_000, public detail?: "api_version_mismatch" | "graphql_error" | "invalid_json") {
    super(code); // Never include provider messages, bodies, URLs or tokens.
  }
}
