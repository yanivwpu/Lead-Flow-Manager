/** Merchant workspace activation is not authorization for Shopify cart or outbound actions. */
export type MerchantActivationSnapshot = {
  accountId: string;
  sessionAccountId: string;
  sessionAligned: boolean;
  connectedShop: string | null;
  hasInstalledToken: boolean;
  planEligible: boolean;
  isShopifyOwner: boolean;
};

export function canActivateMerchantWorkspace(input: MerchantActivationSnapshot): boolean {
  return !!input.accountId &&
    input.accountId === input.sessionAccountId &&
    input.sessionAligned === true &&
    input.isShopifyOwner === true &&
    input.planEligible === true &&
    input.hasInstalledToken === true &&
    typeof input.connectedShop === "string" &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(input.connectedShop);
}

export function merchantWorkspaceActivated(value: Date | string | null | undefined): boolean {
  if (!value) return false;
  const millis = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(millis);
}
