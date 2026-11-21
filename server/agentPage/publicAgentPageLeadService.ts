/**
 * Public agent page lead intake — creates CRM contacts via channelService.
 */
import { AGENT_PAGE_FORM_ACCOUNT, type PublicAgentLeadBody } from "@shared/agent/agentPageSchema";
import { randomUUID } from "node:crypto";
import { collectValidatedIdentity } from "@shared/webchatIdentityPromotion";
import { publishedNeighborhoods, neighborhoodLeadContext } from "./neighborhoodPages";
import { emptySellerPreferenceProfile } from "@shared/sellerPreferenceSchema";
import { persistSellerPreferenceProfile } from "../sellerPreferenceService";
import { canShowPublicStreetAddress } from "@shared/inventory/publicListingPublication";
import { fetchPublishedListingsForAgentPage, incrementAgentPageAnalytics, resolveAgentPageBySlug } from "./agentPageDb";
import { resolveAgentPageFormContact } from "./agentPageFormContact";

function buildLeadMessage(
  intent: PublicAgentLeadBody["intent"],
  body: PublicAgentLeadBody,
  listingLabel?: string,
  pageLabel = "agent page",
): string {
  const name = body.name?.trim() || "Visitor";
  const propertyLine = body.propertyAddress?.trim()
    ? `Property: ${body.propertyAddress.trim()}`
    : listingLabel
      ? `Property: ${listingLabel}`
      : null;
  const listingUrlLine = body.listingUrl?.trim() ? `Listing: ${body.listingUrl.trim()}` : null;
  const sourceLine = body.source?.trim() ? `Source: ${body.source.trim()}` : null;
  const contextLines = [propertyLine, listingUrlLine, sourceLine].filter(Boolean);

  switch (intent) {
    case "message":
      return body.message?.trim() || `${name} reached out via ${pageLabel}.`;
    case "ask_about":
      return [body.message?.trim(), ...contextLines]
        .filter(Boolean)
        .join("\n") || `${name} is interested in ${listingLabel || "a listing"} (${pageLabel}).`;
    case "schedule_showing":
      return [
        body.message?.trim() || `${name} requested a showing via ${pageLabel}.`,
        ...contextLines,
      ]
        .filter(Boolean)
        .join("\n");
    case "home_worth":
      return [
        `${name} requested a home valuation via ${pageLabel}.`,
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
  const identity = collectValidatedIdentity(body);
  // The general chat validator also accepts formatted strings; require enough actual digits here.
  if (identity.phone) {
    const digits = identity.phone.replace(/\D/g, "");
    identity.phone = digits.length >= 7 && digits.length <= 15 ? digits : undefined;
  }
  if (!identity.email && !identity.phone) {
    return { ok: false, error: "Enter a valid email address or phone number.", status: 400 };
  }
  const agent = await resolveAgentPageBySlug(slug);
  if (!agent) return { ok: false, error: "Agent page not found", status: 404 };

  const page = body.neighborhood && !body.embed && !body.listingId
    ? (await publishedNeighborhoods(agent.userId, body.neighborhood))[0] : undefined;
  if (body.neighborhood && !page) return { ok: false, error: "Neighborhood page not found", status: 404 };
  const pageContext = page && agent.agentPageSlug ? neighborhoodLeadContext(agent.agentPageSlug, page) : undefined;
  const isEmbed = body.embed === true;
  const pageLabel = isEmbed ? "embedded agent page" : "agent page";
  const webchatLeadSource = isEmbed ? ("agent_page_embed" as const) : ("agent_page" as const);
  const leadSourceLabel = page ? `Agent Page · ${page.name}` : isEmbed ? "Embedded Agent Page" : "Agent Page";
  const userId = agent.userId;
  let listingLabel: string | undefined;

  if (body.listingId) {
    const listings = await fetchPublishedListingsForAgentPage(userId);
    const listing = listings.find((l) => l.id === body.listingId);
    if (!listing) return { ok: false, error: "Listing not found", status: 404 };
    listingLabel = [
      canShowPublicStreetAddress(listing.listingCompliance) ? listing.addressLine1 : null,
      listing.city,
      listing.state,
    ].filter(Boolean).join(", ");
  }

  const customFields: Record<string, unknown> = {
    leadSource: leadSourceLabel,
  };
  if (body.listingId) {
    customFields.agentPageListingId = body.listingId;
    customFields.listingReference = body.propertyAddress?.trim() || listingLabel || body.listingId;
  }
  if (body.listingUrl?.trim()) customFields.agentPageListingUrl = body.listingUrl.trim();
  if (body.propertyAddress?.trim()) customFields.propertyAddress = body.propertyAddress.trim();
  if (pageContext) {
    customFields.agentNeighborhood = pageContext.agentNeighborhood;
    customFields.agentNeighborhoodName = pageContext.agentNeighborhoodName;
    customFields.leadSourceDetail = pageContext.pageTitle;
    customFields.agentNeighborhoodUrl = pageContext.latestUrl;
  } else if (body.source?.trim()) customFields.leadSourceDetail = body.source.trim();
  if (body.intent === "home_worth") {
    customFields.sellerIntent = "seller_valuation";
    customFields.leadType = "Seller";
  }

  const form = await resolveAgentPageFormContact({
    userId, identity, sourcePage: webchatLeadSource, attribution: customFields, pageContext,
  });
  if (!form) return { ok: false, error: "Please use one contact method or contact the agent directly.", status: 409 };

  const { channelService } = await import("../channelService");
  const result = await channelService.processIncomingMessage({
    userId,
    channel: "webchat",
    channelContactId: AGENT_PAGE_FORM_ACCOUNT,
    content: buildLeadMessage(body.intent, { ...body, name: identity.name }, listingLabel, pageLabel),
    externalMessageId: `agent_page_${randomUUID()}`,
    agentPageForm: form,
  });
  if (!result.success || !result.message) return { ok: false, error: "Failed to save inquiry", status: 500 };
  const contactId = form.contact.id;
  const { runAgentPageLeadReview } = await import("../workflowEngine");
  await runAgentPageLeadReview(form.contact, form.conversation.id);

  if (body.intent === "home_worth") {
    const profile = {
      ...emptySellerPreferenceProfile(),
      profileStatus: "partial" as const,
      lastInboundAt: new Date().toISOString(),
      lastSellerIntent: "seller_valuation",
      ...(body.propertyAddress
        ? { propertyAddress: { value: body.propertyAddress, source: "explicit" as const, confidence: 1, updatedAt: new Date().toISOString() } }
        : {}),
      ...(body.reasonForSelling
        ? { reasonForSelling: { value: body.reasonForSelling, source: "explicit" as const, confidence: 1, updatedAt: new Date().toISOString() } }
        : {}),
    };
    await persistSellerPreferenceProfile(contactId, profile, userId);
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
