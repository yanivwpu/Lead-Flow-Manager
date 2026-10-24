/**
 * E-commerce event triage: strictly local administrative review. This does not
 * dispatch any workflow, change a Shopify order, or send to a customer.
 */
export const ECOMMERCE_EVENT_REVIEW_INTENTS = ["mark_reviewed"] as const;

/** PostgreSQL BIGINT identity, represented as a string to avoid JS rounding. */
export function parseReviewEventId(input: unknown): string | null {
  if (typeof input !== "string" || !/^[1-9][0-9]{0,18}$/.test(input)) return null;
  if (BigInt(input) > 9223372036854775807n) return null;
  return input;
}

export function parseReviewEventRequest(body: unknown): { eventId: string } | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || data.action !== "mark_reviewed") return null;
  const eventId = parseReviewEventId(data.eventId);
  return eventId ? { eventId } : null;
}
