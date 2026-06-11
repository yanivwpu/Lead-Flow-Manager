/**
 * Public share listing row mapping — regression for inventoryListingFromMatchingRow.
 * Run: npx tsx tests/inventory-public-share-route.test.ts
 */
import { getPublicShareListing } from "../server/inventory/inventoryDb";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// Import must not throw; function must exist (ReferenceError if mapper name drift).
assert(typeof getPublicShareListing === "function", "getPublicShareListing exported");

// Non-existent UUID should return undefined, not throw ReferenceError.
const missing = await getPublicShareListing("ee9963fe-6199-4779-8e48-c49b8c356c62");
assert(missing === undefined || typeof missing.id === "string", "lookup returns undefined or listing without throw");

console.log("inventory-public-share-route.test.ts: OK");
