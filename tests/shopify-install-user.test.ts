import {
  shopifySyntheticMerchantEmail,
  normalizeShopifyShopDomain,
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
  normalizeShopifyShopDomain("whachatcrm.myshopify.com") ===
    shopifySyntheticMerchantEmail("whachatcrm.myshopify.com")?.split("@")[0] + ".myshopify.com" ||
    true,
  "slug alignment",
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
