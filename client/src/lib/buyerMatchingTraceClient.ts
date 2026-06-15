import {
  BUYER_MATCHING_TRACE_TAG,
  isBuyerMatchingTraceVerbose,
  type BuyerMatchingTracePayload,
} from "@shared/buyerMatchingTrace";

/** Browser emitter — always warns on mismatch; full steps in DEV or DEBUG_BUYER_MATCHING. */
export function logBuyerMatchingTraceClient(payload: BuyerMatchingTracePayload): void {
  const mismatches = payload.mismatches ?? [];
  const body = {
    tag: BUYER_MATCHING_TRACE_TAG,
    event: mismatches.length > 0 ? "warning" : payload.event ?? "step",
    ...payload,
    mismatches: mismatches.length ? mismatches : undefined,
    loggedAt: payload.loggedAt ?? new Date().toISOString(),
  };
  if (mismatches.length > 0) {
    console.warn(BUYER_MATCHING_TRACE_TAG, body);
    return;
  }
  if (import.meta.env.DEV || isBuyerMatchingTraceVerbose()) {
    console.info(BUYER_MATCHING_TRACE_TAG, body);
  }
}

export {
  buildBuyerMatchingTraceId,
  detectChipProfileMismatches,
  snapshotProfileTraceFields,
  summarizeListingsForTrace,
} from "@shared/buyerMatchingTrace";
