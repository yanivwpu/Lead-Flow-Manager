/**
 * Shopify OAuth CSRF state — must work across server instances (signed state, not in-memory Map).
 */
import crypto from "crypto";

process.env.SHOPIFY_API_SECRET ||= "test-shopify-api-secret-for-oauth-state";

const SHOP = "test-store.myshopify.com";

async function loadShopifyOAuth() {
  return import("../server/shopify.ts");
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const {
    createSignedShopifyOAuthState,
    verifySignedShopifyOAuthState,
    validateOAuthState,
    SHOPIFY_OAUTH_STATE_TTL_MS,
  } = await loadShopifyOAuth();

  const state = createSignedShopifyOAuthState(SHOP);
  assert(!!state, "creates signed state");
  assert(state!.includes("."), "state has signature segment");

  const ok = verifySignedShopifyOAuthState(state!, SHOP);
  assert(ok.ok === true, "valid state verifies");

  const wrongShop = verifySignedShopifyOAuthState(state!, "other-store.myshopify.com");
  assert(wrongShop.ok === false && wrongShop.reason === "shop_mismatch", "shop mismatch rejected");

  const tampered = `${state!.slice(0, -4)}xxxx`;
  const badSig = verifySignedShopifyOAuthState(tampered, SHOP);
  assert(badSig.ok === false, "tampered state rejected");

  assert(validateOAuthState(state!, SHOP), "validateOAuthState accepts signed state");

  // Case normalization: callback shop may differ in casing from authorize URL.
  assert(
    validateOAuthState(state!, "Test-Store.myshopify.com"),
    "validates with mixed-case shop from Shopify callback",
  );

  // Expired state
  const oldPayload = {
    n: crypto.randomBytes(16).toString("hex"),
    s: SHOP,
    t: Date.now() - SHOPIFY_OAUTH_STATE_TTL_MS - 1000,
  };
  const body = Buffer.from(JSON.stringify(oldPayload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(body)
    .digest("base64url");
  const expired = `${body}.${sig}`;
  const expiredCheck = verifySignedShopifyOAuthState(expired, SHOP);
  assert(expiredCheck.ok === false && expiredCheck.reason === "expired", "expired state rejected");

  console.log("shopify-oauth-state.test.ts: all passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
