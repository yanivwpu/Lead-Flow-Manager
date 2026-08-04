/**
 * Workspace Offers & Payment Links — structured catalog for Live Business Data.
 * Tenant-scoped by userId (workspace owner). Not derived from website knowledge scans.
 */

import { z } from "zod";
import type { BusinessPackageRecord } from "./businessPackages";
import {
  findBestPackageByName,
  formatBusinessPackageSummary,
  scorePackageNameMatch,
} from "./businessPackages";

export const OFFER_BILLING_CADENCES = [
  "once",
  "day",
  "week",
  "month",
  "quarter",
  "year",
  "custom",
] as const;

export type OfferBillingCadence = (typeof OFFER_BILLING_CADENCES)[number];

export const OFFER_AVAILABILITY = ["available", "limited", "waitlist", "unavailable"] as const;
export type OfferAvailability = (typeof OFFER_AVAILABILITY)[number];

const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https:\/\//i.test(u), { message: "URL must use HTTPS" })
  .refine((u) => !/^https?:\/\/price_[a-zA-Z0-9]+$/i.test(u) && !/^price_[a-zA-Z0-9]+$/i.test(u), {
    message: "Stripe price_… IDs are not valid checkout URLs",
  });

const optionalHttpsUrl = z
  .union([httpsUrlSchema, z.literal(""), z.null()])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return null;
    return v;
  });

export const workspaceOfferWriteSchema = z.object({
  internalName: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullish().transform((v) => v || null),
  benefits: z.array(z.string().trim().min(1).max(240)).max(40).default([]),
  priceDisplay: z.string().trim().max(120).nullish().transform((v) => v || null),
  billingCadence: z.enum(OFFER_BILLING_CADENCES).default("once"),
  checkoutUrl: optionalHttpsUrl,
  followUpUrl: optionalHttpsUrl,
  availability: z.enum(OFFER_AVAILABILITY).default("available"),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
  category: z.string().trim().max(80).nullish().transform((v) => v || null),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  aiGuidance: z.string().trim().max(1500).nullish().transform((v) => v || null),
});

export type WorkspaceOfferWrite = z.infer<typeof workspaceOfferWriteSchema>;

export type WorkspaceOffer = WorkspaceOfferWrite & {
  id: string;
  userId: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Public checkout / payment host allow-hints (not exclusive — any https URL is accepted). */
export const KNOWN_CHECKOUT_HOST_HINTS = [
  "checkout.stripe.com",
  "buy.stripe.com",
  "stripe.com",
  "paypal.com",
  "paypal.me",
  "square.link",
  "squareup.com",
  "checkout.square.site",
  "pay.google.com",
  "gumroad.com",
  "lemonsqueezy.com",
  "paddle.com",
];

export function isLikelyStripePriceId(value: string): boolean {
  const v = String(value || "").trim();
  return /^price_[a-zA-Z0-9]+$/i.test(v) || /^https?:\/\/price_[a-zA-Z0-9]+$/i.test(v);
}

export function validateCheckoutUrl(raw: string | null | undefined): {
  ok: boolean;
  url: string | null;
  error?: string;
} {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, url: null };
  }
  const trimmed = String(raw).trim();
  if (isLikelyStripePriceId(trimmed)) {
    return {
      ok: false,
      url: null,
      error: "Stripe price_… IDs are not clickable checkout URLs. Paste a full HTTPS payment link.",
    };
  }
  const parsed = optionalHttpsUrl.safeParse(trimmed);
  if (!parsed.success) {
    return { ok: false, url: null, error: parsed.error.issues[0]?.message || "Invalid HTTPS URL" };
  }
  return { ok: true, url: parsed.data };
}

export function offerToBusinessPackage(offer: {
  id: string;
  displayName: string;
  priceDisplay: string | null;
  benefits: string[];
  checkoutUrl: string | null;
  followUpUrl: string | null;
  availability: string;
  active: boolean;
  billingCadence?: string | null;
  aiGuidance?: string | null;
}): BusinessPackageRecord {
  return {
    packageId: offer.id,
    displayName: offer.displayName,
    priceDisplay: offer.priceDisplay,
    benefits: offer.benefits || [],
    checkoutUrl: offer.active ? offer.checkoutUrl : null,
    onboardingUrl: offer.active ? offer.followUpUrl : null,
    availability: offer.availability,
    status: offer.active
      ? offer.availability === "unavailable"
        ? "unavailable"
        : "available"
      : "unavailable",
  };
}

export function formatOfferLiveSummary(offer: {
  id: string;
  displayName: string;
  priceDisplay: string | null;
  benefits: string[];
  checkoutUrl: string | null;
  followUpUrl: string | null;
  availability: string;
  active: boolean;
  billingCadence?: string | null;
  aiGuidance?: string | null;
}): string {
  const pkg = offerToBusinessPackage(offer);
  const parts = [
    formatBusinessPackageSummary(pkg),
    offer.billingCadence && offer.billingCadence !== "custom"
      ? `Billing: ${offer.billingCadence}`
      : null,
    !offer.checkoutUrl ? "Checkout: not configured (do not invent a payment link)" : null,
    offer.aiGuidance ? `Guidance: ${offer.aiGuidance.slice(0, 200)}` : null,
  ].filter(Boolean);
  return parts.join(" | ");
}

const PURCHASE_INTENT_RE =
  /\b(?:buy|purchase|pay\s+now|checkout|sign\s*up|get\s+started|subscribe|i'?ll\s+take|ready\s+to\s+(?:buy|pay|purchase|sign)|send\s+(?:me\s+)?(?:the\s+)?(?:link|payment|checkout)|how\s+(?:do\s+i|to)\s+(?:pay|buy|purchase|sign\s*up))\b/i;

export function messageHasPurchaseIntent(message: string): boolean {
  return PURCHASE_INTENT_RE.test(String(message || ""));
}

/** Score offer relevance against a customer message (higher = better). */
export function scoreOfferRelevance(
  offer: { displayName: string; internalName: string; tags: string[]; category: string | null; description: string | null },
  message: string,
  hint: string | null,
): number {
  let score = 0;
  if (hint) {
    score = Math.max(
      score,
      scorePackageNameMatch(offer.displayName, hint),
      scorePackageNameMatch(offer.internalName, hint),
    );
  }
  const msg = String(message || "").toLowerCase();
  const name = offer.displayName.toLowerCase();
  if (name && msg.includes(name)) score = Math.max(score, 90);
  for (const tag of offer.tags || []) {
    if (tag && msg.includes(tag.toLowerCase())) score = Math.max(score, 50);
  }
  if (offer.category && msg.includes(offer.category.toLowerCase())) {
    score = Math.max(score, 45);
  }
  return score;
}

export function selectRelevantOffers<T extends {
  id: string;
  displayName: string;
  internalName: string;
  tags: string[];
  category: string | null;
  description: string | null;
  active: boolean;
  sortOrder: number;
}>(
  offers: T[],
  message: string,
  hint: string | null,
  limit: number,
): T[] {
  const active = offers.filter((o) => o.active);
  if (active.length === 0) return [];

  const scored = active
    .map((o) => ({ o, score: scoreOfferRelevance(o, message, hint) }))
    .sort((a, b) => b.score - a.score || a.o.sortOrder - b.o.sortOrder);

  const matched = scored.filter((s) => s.score >= 40);
  if (matched.length === 1) {
    // One clear match + at most one sibling for brief comparison when purchase intent is unclear.
    const top = matched[0].o;
    const sibling = active.find((o) => o.id !== top.id);
    return sibling && !messageHasPurchaseIntent(message)
      ? [top, sibling].slice(0, limit)
      : [top].slice(0, limit);
  }
  if (matched.length > 1) {
    return matched.slice(0, Math.min(limit, 3)).map((s) => s.o);
  }

  // Broad pricing ask — short list by sort order, never the full catalog past the cap.
  return [...active]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, Math.min(limit, 5));
}

export function findOfferByNameHint<T extends { displayName: string; internalName: string }>(
  offers: T[],
  hint: string,
): T | null {
  const asPackages = offers.map((o, i) => ({
    packageId: String(i),
    displayName: o.displayName,
    priceDisplay: null,
    benefits: [] as string[],
    checkoutUrl: null,
    onboardingUrl: null,
    availability: null,
    status: "available" as const,
    _offer: o,
  }));
  const best = findBestPackageByName(
    asPackages.map(({ _offer, ...pkg }) => pkg),
    hint,
  );
  if (!best) return null;
  const idx = asPackages.findIndex((p) => p.displayName === best.displayName);
  return idx >= 0 ? asPackages[idx]._offer : null;
}

/**
 * Detect whether a draft reply includes a payment/checkout URL that must wait for human send approval.
 */
export function draftContainsCheckoutUrl(
  draft: string,
  knownCheckoutUrls: Array<string | null | undefined>,
): boolean {
  const text = String(draft || "");
  if (!text.trim()) return false;
  const urls = knownCheckoutUrls
    .map((u) => String(u || "").trim())
    .filter((u) => /^https:\/\//i.test(u));
  for (const url of urls) {
    if (text.includes(url)) return true;
  }
  // Generic payment-link patterns when the model invents or paraphrases a known host.
  return /https:\/\/(?:buy|checkout)\.stripe\.com\/\S+/i.test(text);
}

export const PAYMENT_LINK_HUMAN_APPROVAL_REASON = "payment_link_requires_human_approval";
