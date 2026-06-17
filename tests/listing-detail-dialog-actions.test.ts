/**
 * Listing modal action button visibility.
 * Run: npx tsx tests/listing-detail-dialog-actions.test.ts
 */
import { shouldShowCopilotListingActions } from "../shared/inventory/listingDetailDialogActions";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const listingId = "33333333-3333-4333-8333-333333333333";

assert(shouldShowCopilotListingActions(listingId), "copilot listing actions shown when listing id exists");
assert(!shouldShowCopilotListingActions(null), "no actions without listing id");

console.log("listing-detail-dialog-actions.test.ts: all passed");
