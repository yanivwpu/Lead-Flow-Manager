import {
  shopifySyntheticMerchantEmail,
  normalizeShopifyShopDomain,
  isShopifySyntheticMerchantEmail,
  sanitizeShopifyOwnerEmail,
} from "../shared/shopifyBilling";
import { isUsersEmailUniqueViolation } from "../server/shopifyInstallUser";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  shopifySyntheticMerchantEmail("whachatcrm.myshopify.com") ===
    "whachatcrm@shopify.whachatcrm.com",
  "synthetic email for shop slug",
);

assert(
  shopifySyntheticMerchantEmail("WhachatCRM.myshopify.com") ===
    "whachatcrm@shopify.whachatcrm.com",
  "normalizes shop before email",
);

assert(
  isShopifySyntheticMerchantEmail("whachatcrm@shopify.whachatcrm.com"),
  "detects synthetic identity",
);
assert(!isShopifySyntheticMerchantEmail("owner@store.com"), "real inbox is not synthetic");

assert(
  sanitizeShopifyOwnerEmail("  Owner@Store.COM ") === "owner@store.com",
  "sanitizes shop.email",
);
assert(
  sanitizeShopifyOwnerEmail("whachatcrm@shopify.whachatcrm.com") === null,
  "rejects synthetic as owner email",
);
assert(
  sanitizeShopifyOwnerEmail("") === null,
  "rejects empty",
);
assert(
  sanitizeShopifyOwnerEmail("not-an-email") === null,
  "rejects malformed",
);

assert(
  normalizeShopifyShopDomain("https://WhachatCRM.myshopify.com/admin") ===
    "whachatcrm.myshopify.com",
  "strips protocol and path",
);

assert(
  isUsersEmailUniqueViolation({ code: "23505", message: "users_email_unique" }),
  "detects postgres unique violation",
);

assert(
  isUsersEmailUniqueViolation(new Error('duplicate key value violates unique constraint "users_email_unique"')),
  "detects message substring",
);

assert(!isUsersEmailUniqueViolation(new Error("other")), "ignores unrelated errors");

console.log("shopify-install-user.test.ts: all passed");
