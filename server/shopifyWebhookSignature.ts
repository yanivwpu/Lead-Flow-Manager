import crypto from "node:crypto";
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "";
export function verifyWebhookHmac(rawBody: Buffer | string, hmac: string): boolean {
  if (!SHOPIFY_API_SECRET || !hmac) return false;

  const calculatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac),
      Buffer.from(calculatedHmac)
    );
  } catch {
    return false;
  }
}
