import type { Contact } from "@shared/schema";
import type { InventoryMatchDraftResponse } from "@shared/inventory/inventoryDraftTypes";
import { buildListingComposerMessage } from "@shared/inventory/inventoryComposerDraft";
import {
  extractBuyerMatchCriteria,
  scoreListingAgainstCriteria,
} from "@shared/inventory/inventoryMatchScoring";
import { formatBuyerPreferenceSummaryForAi } from "@shared/buyerPreferenceDisplay";
import { readBuyerPreferenceProfile, loadPersistedBuyerPreferenceProfile } from "../buyerPreferenceService";
import { aiProvider } from "../aiProvider";
import { storage } from "../storage";
import { getAppOrigin } from "../urlOrigins";
import { canUseInventoryConnector } from "./inventoryGate";
import { getInventoryListing } from "./inventoryDb";
import { inventoryListingToMatchInput } from "./inventoryMatchingService";

function contactFirstName(contact: Contact): string {
  const name = (contact.name || "").trim();
  if (!name) return "there";
  return name.split(/\s+/)[0] || "there";
}

function formatBudget(cents: number | null): string | null {
  if (cents == null) return null;
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2).replace(/\.00$/, "")}M`;
  }
  if (dollars >= 1_000) return `$${Math.round(dollars / 1_000).toLocaleString()}k`;
  return `$${Math.round(dollars).toLocaleString()}`;
}

function propertyLabel(listing: ReturnType<typeof inventoryListingToMatchInput>): string {
  const type = listing.propertyType?.replace(/_/g, " ") || "property";
  const area = [listing.city, listing.state].filter(Boolean).join(", ");
  if (area) return `${type} in ${area}`;
  return type;
}

function bedsLabel(beds: number | null): string | null {
  if (beds == null) return null;
  const n = beds % 1 === 0 ? beds : beds.toFixed(1);
  return `${n} bedroom${beds === 1 ? "" : "s"}`;
}

function featurePhraseFromReasons(reasons: string[]): string | null {
  const pool = reasons.find((r) => /pool/i.test(r));
  if (pool) return "pool";
  const waterfront = reasons.find((r) => /waterfront/i.test(r));
  if (waterfront) return "waterfront access";
  return null;
}

function normalizeBullets(reasons: string[], opportunityType?: string, priceReductionLabel?: string | null): string[] {
  const bullets = [...reasons];
  if (opportunityType === "price_reduced") {
    bullets.unshift(priceReductionLabel || "Recently reduced price");
  } else if (opportunityType === "new_listing") {
    bullets.unshift("New listing in your search criteria");
  }
  return [...new Set(bullets.map((b) => b.trim()).filter(Boolean))].slice(0, 6);
}

function buildTemplateDraft(input: {
  firstName: string;
  listing: ReturnType<typeof inventoryListingToMatchInput>;
  reasons: string[];
  profileSummary: string;
  hasListingUrl: boolean;
  opportunityType?: string;
  priceReductionLabel?: string | null;
}): string {
  const { firstName, listing, reasons, hasListingUrl, opportunityType, priceReductionLabel } = input;
  const label = propertyLabel(listing);
  const beds = bedsLabel(listing.beds);
  const feature = featurePhraseFromReasons(reasons);
  const budget = formatBudget(listing.priceCents);

  const parts: string[] = [];
  if (opportunityType === "price_reduced") {
    parts.push(
      priceReductionLabel
        ? `a ${label} that just had a price reduction`
        : `a listing in ${listing.city || "your preferred area"} that recently dropped in price`,
    );
  } else {
    parts.push(hasListingUrl ? `a ${label}` : `a listing that matches what you're looking for`);
  }

  const detailBits: string[] = [];
  if (beds) detailBits.push(beds);
  if (feature) detailBits.push(feature);
  if (budget && reasons.some((r) => /budget/i.test(r))) {
    detailBits.push(`within your ${budget} budget`);
  } else if (budget && reasons.some((r) => /budget|price/i.test(r))) {
    detailBits.push(`priced around ${budget}`);
  }

  const detailClause =
    detailBits.length > 0 ? ` — ${detailBits.join(", ")}` : "";

  const cta = hasListingUrl
    ? "Would you like me to send you the details or schedule a time to review it?"
    : "Would you like me to share more details or schedule a time to review it?";

  return `Hi ${firstName}, I found ${parts[0]}${detailClause}. ${cta}`;
}

async function generateAiDraft(input: {
  firstName: string;
  listing: ReturnType<typeof inventoryListingToMatchInput>;
  reasons: string[];
  profileSummary: string;
  hasListingUrl: boolean;
  opportunityType?: string;
  priceReductionLabel?: string | null;
}): Promise<{ draft: string; matchBullets: string[] } | null> {
  const matchBullets = normalizeBullets(
    input.reasons,
    input.opportunityType,
    input.priceReductionLabel,
  );

  const listingContext = {
    city: input.listing.city,
    state: input.listing.state,
    propertyType: input.listing.propertyType,
    price: formatBudget(input.listing.priceCents),
    beds: input.listing.beds,
    baths: input.listing.baths,
    hasListingUrl: input.hasListingUrl,
    opportunityType: input.opportunityType ?? null,
    priceReductionLabel: input.priceReductionLabel ?? null,
  };

  const system = `You help a realtor draft a short, warm buyer outreach message about a listing match.
Return JSON only: { "draft": string, "matchBullets": string[] }
Rules:
- draft: 2-3 sentences, conversational, first name greeting
- matchBullets: 3-6 short bullet phrases explaining why this is a strong match (reuse provided reasons when accurate)
- NEVER invent or include listing URLs or links
- If no listing URL is available, say "I found a listing that matches…" not a specific address
- Do not promise automatic sending — the realtor sends manually
- No markdown in draft`;

  const user = `Buyer first name: ${input.firstName}
Buyer preferences: ${input.profileSummary || "Not fully captured yet"}
Match reasons: ${matchBullets.join("; ")}
Listing: ${JSON.stringify(listingContext)}
${input.opportunityType === "price_reduced" ? "Highlight the price reduction naturally." : ""}`;

  try {
    const raw = await aiProvider.complete(
      "reply",
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { jsonMode: true, maxTokens: 350 },
    );
    const parsed = JSON.parse(raw || "{}") as { draft?: string; matchBullets?: string[] };
    const draft = typeof parsed.draft === "string" ? parsed.draft.trim() : "";
    if (!draft) return null;
    const bullets =
      Array.isArray(parsed.matchBullets) && parsed.matchBullets.length > 0
        ? parsed.matchBullets.filter((b) => typeof b === "string").slice(0, 6)
        : matchBullets;
    if (!input.hasListingUrl && /https?:\/\//i.test(draft)) {
      return null;
    }
    return { draft, matchBullets: bullets };
  } catch (err) {
    console.warn("[inventory-draft] AI generation failed, using template", err);
    return null;
  }
}

export async function generateInventoryMatchDraft(
  contactId: string,
  listingId: string,
  userId: string,
  options?: {
    reasons?: string[];
    opportunityType?: "new_listing" | "price_reduced";
    priceReductionLabel?: string | null;
  },
): Promise<InventoryMatchDraftResponse | { error: string; httpStatus: number }> {
  const contact = await storage.getContact(contactId);
  if (!contact) {
    return { error: "Contact not found", httpStatus: 404 };
  }
  if (contact.userId !== userId) {
    return { error: "Forbidden", httpStatus: 403 };
  }

  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return { error: "Inventory connector unavailable", httpStatus: gate.reason === "feature_disabled" ? 404 : 403 };
  }

  const listingRow = await getInventoryListing(userId, listingId);
  if (!listingRow) {
    return { error: "Listing not found", httpStatus: 404 };
  }

  const listing = inventoryListingToMatchInput(listingRow);
  const profile =
    (await loadPersistedBuyerPreferenceProfile(contactId)) ??
    readBuyerPreferenceProfile(contact);
  const profileSummary = formatBuyerPreferenceSummaryForAi(profile);
  const criteria = extractBuyerMatchCriteria(profile);

  let reasons = (options?.reasons ?? []).filter((r) => typeof r === "string" && r.trim());
  if (reasons.length === 0 && criteria.hasAnyCriteria) {
    const scored = scoreListingAgainstCriteria(listing, criteria);
    reasons = scored?.reasons ?? [];
  }

  const matchBullets = normalizeBullets(
    reasons,
    options?.opportunityType,
    options?.priceReductionLabel,
  );

  const hasListingUrl = true;
  const firstName = contactFirstName(contact);

  const aiResult = await generateAiDraft({
    firstName,
    listing,
    reasons,
    profileSummary,
    hasListingUrl,
    opportunityType: options?.opportunityType,
    priceReductionLabel: options?.priceReductionLabel,
  });

  const draft =
    aiResult?.draft ??
    buildTemplateDraft({
      firstName,
      listing,
      reasons,
      profileSummary,
      hasListingUrl,
      opportunityType: options?.opportunityType,
      priceReductionLabel: options?.priceReductionLabel,
    });

  const bullets = aiResult?.matchBullets ?? matchBullets;
  const composer = buildListingComposerMessage({
    listing: {
      listingId,
      priceCents: listing.priceCents,
      beds: listing.beds,
      baths: listing.baths,
      city: listing.city,
      state: listing.state,
      propertyType: listing.propertyType,
      listingUrl: listing.listingUrl,
      description: listing.description,
      photos: listing.photos,
      appOrigin: getAppOrigin(),
    },
    contactFirstName: firstName,
    introDraft: draft,
    featureHints: bullets,
  });

  return {
    draft,
    composerDraft: composer.text,
    viewUrl: composer.viewUrl,
    primaryPhotoUrl: composer.primaryPhotoUrl,
    matchBullets: bullets,
    listingId,
    contactId,
  };
}
