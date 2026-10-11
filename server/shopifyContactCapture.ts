import { shopifyContactCaptureLog, type ShopifyEmailCaptureResult } from "@shared/shopifyContactPrivacy";

type CaptureInput = { userId: string; shop: string; accessToken: string };
export async function captureShopifyOwnerEmail(input: CaptureInput, deps: {
  fetch(shop: string, token: string): Promise<ShopifyEmailCaptureResult>;
  persist(input: CaptureInput, result: ShopifyEmailCaptureResult, at: Date): Promise<boolean>;
  emit?(line: string): void;
  now?(): Date;
}): Promise<ShopifyEmailCaptureResult> {
  let result: ShopifyEmailCaptureResult;
  try { result = await deps.fetch(input.shop, input.accessToken); }
  catch { result = { status: "fetch_failed", email: null }; }
  const at = deps.now?.() ?? new Date();
  try {
    if (!await deps.persist(input, result, at)) result = { status: "installation_inactive", email: null };
  } catch { result = { status: "persist_failed", email: null }; }
  (deps.emit ?? console.info)(shopifyContactCaptureLog(result.status, at));
  return result;
}
