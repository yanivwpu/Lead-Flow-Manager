/** Merchant planning configuration only. No setting authorizes delivery. */
export const POST_PURCHASE_JOURNEYS = [
  "orderConfirmation", "fulfillmentUpdate", "cancellation", "reviewRequest", "repeatPurchase", "winBack",
] as const;
export type PostPurchaseJourney = typeof POST_PURCHASE_JOURNEYS[number];
export type JourneyPlan = { selected: boolean; delayMinutes: number };
export type PostPurchasePlans = Record<PostPurchaseJourney, JourneyPlan>;
export const JOURNEY_POLICY = {
  orderConfirmation: { topic: "orders/create", category: "UTILITY", delay: 0 },
  fulfillmentUpdate: { topic: "orders/fulfilled", category: "UTILITY", delay: 0 },
  cancellation: { topic: "orders/cancelled", category: "UTILITY", delay: 0 },
  reviewRequest: { topic: "orders/fulfilled", category: "MARKETING", delay: 7 * 1440 },
  repeatPurchase: { topic: "orders/fulfilled", category: "MARKETING", delay: 30 * 1440 },
  winBack: { topic: "orders/fulfilled", category: "MARKETING", delay: 90 * 1440 },
} as const;
export function isPostPurchaseJourney(value: unknown): value is PostPurchaseJourney {
  return typeof value === "string" && POST_PURCHASE_JOURNEYS.includes(value as PostPurchaseJourney);
}
export function validJourneyPlan(value: unknown): value is JourneyPlan {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const plan = value as Record<string, unknown>;
  return Object.keys(plan).length === 2 && typeof plan.selected === "boolean" &&
    Number.isInteger(plan.delayMinutes) && Number(plan.delayMinutes) >= 0 && Number(plan.delayMinutes) <= 180 * 1440;
}
export function readPostPurchasePlans(config: unknown): PostPurchasePlans {
  const raw = config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>).ecommercePostPurchasePlans : null;
  const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return Object.fromEntries(POST_PURCHASE_JOURNEYS.map(journey => [
    journey, validJourneyPlan(saved[journey]) ? { ...saved[journey] } : {
      selected: false, delayMinutes: JOURNEY_POLICY[journey].delay,
    },
  ])) as PostPurchasePlans;
}
export function parsePostPurchasePlanChange(input: unknown): { journey: PostPurchaseJourney; plan: JourneyPlan } | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (Object.keys(raw).length !== 3 || raw.action !== "save_post_purchase_plan" ||
      !isPostPurchaseJourney(raw.journey) || !validJourneyPlan(raw.plan)) return null;
  return { journey: raw.journey, plan: { ...raw.plan } };
}
