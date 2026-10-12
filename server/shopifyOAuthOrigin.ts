/** Shopify credentials and their callback must stay in the same environment. */
export function getShopifyOAuthOrigin(): string {
  const configured = process.env.APP_URL || process.env.SHOPIFY_APP_HOST;
  const staging = process.env.RAILWAY_ENVIRONMENT_NAME === "staging";
  if (!configured && staging) throw new Error("Staging Shopify requires APP_URL");
  const raw = configured || "https://app.whachatcrm.com";
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (url.username || url.password) throw new Error("Shopify origin cannot contain credentials");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.protocol === "http:")) {
    throw new Error("Shopify app origin must use HTTPS");
  }
  if (staging && (url.hostname === "app.whachatcrm.com" || url.hostname === "www.whachatcrm.com")) {
    throw new Error("Staging Shopify cannot use a production callback origin");
  }
  return url.origin;
}
