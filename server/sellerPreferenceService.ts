/**
 * Seller Lead Engine — preference memory + sync (Phase 1).
 */
import type { Contact } from "@shared/schema";
import {
  emptySellerPreferenceProfile,
  normalizeSellerPreferenceProfile,
  sellerProfileHasData,
  type SellerPreferenceProfile,
} from "@shared/sellerPreferenceSchema";
import {
  heuristicSellerPatchFromText,
  mergeSellerPreferenceProfile,
} from "@shared/sellerPreferenceExtractionNormalize";
import {
  classifySellerIntent,
  isMixedSellerBuyerIntent,
  type SellerIntentClass,
} from "@shared/sellerIntent";
import { isRealEstateIndustry, isRgeInstalledForUser } from "./buyerPreferenceService";
import { storage } from "./storage";

export function readSellerPreferenceProfile(contact: Contact): SellerPreferenceProfile {
  const raw = (contact as Contact & { sellerPreferenceProfile?: unknown }).sellerPreferenceProfile;
  return normalizeSellerPreferenceProfile(raw);
}

export async function persistSellerPreferenceProfile(
  contactId: string,
  profile: SellerPreferenceProfile,
): Promise<void> {
  await storage.updateContactSellerPreferenceProfile(contactId, profile);
}

export function resolveSellerIntentForContact(
  contact: Contact,
  inboundText: string,
): SellerIntentClass | null {
  const profile = readSellerPreferenceProfile(contact);
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const prior =
    (profile.lastSellerIntent as SellerIntentClass | undefined) ||
    (typeof cf.sellerIntent === "string" ? (cf.sellerIntent as SellerIntentClass) : null);
  return classifySellerIntent({
    inboundText,
    hasSellerProfile: sellerProfileHasData(profile) || profile.profileStatus !== "empty",
    priorSellerIntent: prior,
  });
}

export async function shouldRunSellerPreferencePipeline(
  userId: string,
  contact: Contact,
  inboundText?: string,
): Promise<{ ok: boolean; reason: string; sellerIntent: SellerIntentClass | null }> {
  const intent = inboundText ? resolveSellerIntentForContact(contact, inboundText) : null;
  const cf = (contact.customFields || {}) as Record<string, unknown>;
  const leadType = String(cf.leadType || "").toLowerCase();
  const hasSellerProfile = sellerProfileHasData(readSellerPreferenceProfile(contact));

  if (intent || leadType === "seller" || hasSellerProfile) {
    return {
      ok: true,
      reason: intent ? `seller_intent_${intent}` : leadType === "seller" ? "seller_lead_type" : "seller_profile",
      sellerIntent: intent,
    };
  }

  const rgeInstalled = await isRgeInstalledForUser(userId);
  if (rgeInstalled && inboundText && classifySellerIntent({ inboundText })) {
    return { ok: true, reason: "rge_seller_signal", sellerIntent: classifySellerIntent({ inboundText }) };
  }

  const bk = await storage.getAiBusinessKnowledge(userId);
  if (isRealEstateIndustry(bk?.industry) && inboundText && classifySellerIntent({ inboundText })) {
    return {
      ok: true,
      reason: "real_estate_seller_signal",
      sellerIntent: classifySellerIntent({ inboundText }),
    };
  }

  return { ok: false, reason: "not_seller", sellerIntent: null };
}

/** Skip buyer inventory / qualification when lead is pure seller (not mixed). */
export { shouldSkipBuyerPipelineForSellerLead } from "@shared/sellerIntent";

export async function syncSellerPreferencesForInboundMessage(input: {
  contact: Contact;
  inboundText: string;
  conversationId?: string;
  sellerIntent?: SellerIntentClass | null;
}): Promise<SellerPreferenceProfile> {
  const existing = readSellerPreferenceProfile(input.contact);
  const intent =
    input.sellerIntent ?? resolveSellerIntentForContact(input.contact, input.inboundText);
  const patch = heuristicSellerPatchFromText(input.inboundText, existing);
  if (intent) patch.lastSellerIntent = intent;

  const merged = mergeSellerPreferenceProfile(existing, {
    ...patch,
    lastInboundAt: new Date().toISOString(),
  });

  await persistSellerPreferenceProfile(input.contact.id, merged);

  const cf = (input.contact.customFields || {}) as Record<string, unknown>;
  const cfPatch: Record<string, unknown> = { ...cf };
  if (intent) cfPatch.sellerIntent = intent;
  if (intent && !isMixedSellerBuyerIntent(intent)) {
    cfPatch.leadType = "Seller";
  } else if (intent && isMixedSellerBuyerIntent(intent)) {
    cfPatch.leadType = "Seller/Buyer";
  }
  await storage.updateContact(
    input.contact.id,
    { customFields: cfPatch },
    { skipAutomationHooks: true },
  );

  return merged;
}

export function buildSellerPreferenceAiContext(profile: SellerPreferenceProfile): Record<string, unknown> {
  const chips: string[] = [];
  if (profile.propertyAddress?.value) chips.push(`Address: ${profile.propertyAddress.value}`);
  if (profile.city?.value) chips.push(`City: ${profile.city.value}`);
  if (profile.timeline?.value) chips.push(`Timeline: ${profile.timeline.value}`);
  if (profile.reasonForSelling?.value) chips.push(`Reason: ${profile.reasonForSelling.value}`);
  if (profile.condition?.value) chips.push(`Condition: ${profile.condition.value}`);
  if (profile.desiredPrice?.value) chips.push(`Desired price: $${profile.desiredPrice.value}`);
  return {
    sellerPreferences: chips.length > 0 ? chips.join("; ") : undefined,
    sellerProfileStatus: profile.profileStatus,
  };
}

export { emptySellerPreferenceProfile, normalizeSellerPreferenceProfile };
