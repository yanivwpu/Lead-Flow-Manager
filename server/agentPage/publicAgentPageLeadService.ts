/**
 * Public agent page lead intake — creates CRM contacts via channelService.
 */
import type { PublicAgentLeadBody } from "@shared/agent/agentPageSchema";
import { emptySellerPreferenceProfile } from "@shared/sellerPreferenceSchema";
import { persistSellerPreferenceProfile } from "../sellerPreferenceService";
import { storage } from "../storage";
import { incrementAgentPageAnalytics, resolveAgentPageBySlug } from "./agentPageDb";
import { fetchPublishedListingsForAgentPage } from "./agentPageDb";

function channelContactId(body: PublicAgentLeadBody): string {
  const email = body.email?.trim().toLowerCase();
  if (email) return email;
  const phone = body.phone?.replace(/\D/g, "");
  if (phone) return phone;
  return `agent_page_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function buildLeadMessage(intent: PublicAgentLeadBody["intent"], body: PublicAgentLeadBody, listingLabel?: string): string {
  const name = body.name?.trim() || "Visitor";
  switch (intent) {
    case "message":
      return body.message?.trim() || `${name} reached out via agent page.`;
    case "ask_about":
      return (
        body.message?.trim() ||
        `${name} is interested in ${listingLabel || "a listing"} (agent page).`
      );
    case "schedule_showing":
      return `${name} requested a showing${listingLabel ? ` for ${listingLabel}` : ""} via agent page.`;
    case "home_worth":
      return [
        `${name} requested a home valuation via agent page.`,
        body.propertyAddress ? `Address: ${body.propertyAddress}` : null,
        body.timeline ? `Timeline: ${body.timeline}` : null,
        body.reasonForSelling ? `Reason: ${body.reasonForSelling}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return `${name} submitted a form on the agent page.`;
  }
}

export async function processPublicAgentPageLead(
  slug: string,
  body: PublicAgentLeadBody,
): Promise<{ ok: true; contactId: string } | { ok: false; error: string; status: number }> {
  const agent = await resolveAgentPageBySlug(slug);
  if (!agent) return { ok: false, error: "Agent page not found", status: 404 };

  const userId = agent.userId;
  let listingLabel: string | undefined;

  if (body.listingId) {
    const listings = await fetchPublishedListingsForAgentPage(userId);
    const listing = listings.find((l) => l.id === body.listingId);
    if (!listing) return { ok: false, error: "Listing not found", status: 404 };
    listingLabel = [listing.addressLine1, listing.city, listing.state].filter(Boolean).join(", ");
  }

  const { channelService } = await import("../channelService");
  const contactIdKey = channelContactId(body);
  const message = buildLeadMessage(body.intent, body, listingLabel);
  const externalMessageId = `agent_page_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

  const result = await channelService.processIncomingMessage({
    userId,
    channel: "webchat",
    channelContactId: contactIdKey,
    contactName: body.name?.trim() || "Website Visitor",
    content: message,
    contentType: "text",
    externalMessageId,
  });

  if (!result.contact?.id) {
    return { ok: false, error: "Failed to create lead", status: 500 };
  }

  const contactId = result.contact.id;
  const customFields: Record<string, unknown> = {
    ...(result.contact.customFields as Record<string, unknown> | undefined),
    sourcePage: "agent_page",
    leadType: body.intent === "home_worth" ? "Seller" : "Buyer",
  };
  if (body.listingId) {
    customFields.agentPageListingId = body.listingId;
    customFields.listingReference = listingLabel || body.listingId;
  }
  if (body.intent === "home_worth") {
    customFields.sellerIntent = "seller_valuation";
  }
  if (body.email) customFields.email = body.email.trim();
  if (body.phone) customFields.phone = body.phone.trim();

  await storage.updateContact(contactId, { customFields });

  if (body.intent === "home_worth") {
    const profile = {
      ...emptySellerPreferenceProfile(),
      profileStatus: "partial" as const,
      lastInboundAt: new Date().toISOString(),
      lastSellerIntent: "seller_valuation",
      ...(body.propertyAddress
        ? { propertyAddress: { value: body.propertyAddress, source: "explicit" as const, confidence: 1 } }
        : {}),
      ...(body.reasonForSelling
        ? { reasonForSelling: { value: body.reasonForSelling, source: "explicit" as const, confidence: 1 } }
        : {}),
    };
    await persistSellerPreferenceProfile(contactId, profile);
  }

  if (body.intent === "ask_about") {
    await incrementAgentPageAnalytics(userId, "ask_about");
  } else if (body.intent === "schedule_showing") {
    await incrementAgentPageAnalytics(userId, "schedule_showing");
  } else if (body.intent === "home_worth") {
    await incrementAgentPageAnalytics(userId, "home_value");
  }

  return { ok: true, contactId };
}
