import { buildBuyerMatchingTraceId } from "@shared/buyerMatchingTrace";

/** Client-side traceId correlation from API echo + websocket refresh. */
const byContact = new Map<string, string>();

export function setBuyerMatchingTraceId(contactId: string, traceId: string | null | undefined): void {
  if (!contactId?.trim() || !traceId?.trim()) return;
  byContact.set(contactId.trim(), traceId.trim());
}

export function captureBuyerMatchingTraceFromApi(
  contactId: string | null | undefined,
  data: { contactId?: unknown; buyerMatchingTraceId?: unknown },
): void {
  const cid = typeof data.contactId === "string" ? data.contactId : contactId;
  if (!cid || typeof data.buyerMatchingTraceId !== "string") return;
  setBuyerMatchingTraceId(cid, data.buyerMatchingTraceId);
}

export function resolveClientBuyerMatchingTraceId(
  contactId: string,
  fallbackMessageId?: string | null,
): string {
  const id = contactId.trim();
  if (!id) return buildBuyerMatchingTraceId("unknown");
  return byContact.get(id) ?? buildBuyerMatchingTraceId(id, fallbackMessageId);
}
