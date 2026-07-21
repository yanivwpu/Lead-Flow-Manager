/**
 * Website-public enrichment provider (Phase 2).
 * Crawls prospect homepage + common paths; extracts public contacts; AI summarizes.
 * Future Apollo/Hunter providers implement the same interface.
 */

import type { Contact } from "@shared/schema";
import type {
  ProspectEnrichmentResult,
  ProspectPublicContacts,
  ProspectWebsiteIntelligence,
} from "@shared/prospectEnrichment";
import {
  fetchPublicHtmlPage,
  htmlToEnrichmentText,
} from "../websiteKnowledgeScraper";
import { aiProvider } from "../aiProvider";
import {
  detectWebsiteSignals,
  extractPublicContactsFromHtml,
} from "./prospectWebsiteContactExtract";
import { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";
import { loadProspectAiWorkspaceContext } from "./prospectAiWorkspaceContext";

export { resolveProspectWebsiteUrl } from "./prospectWebsiteUrl";

const GUIDED_PATHS = [
  { key: "home", path: "/" },
  { key: "contact", path: "/contact" },
  { key: "contact-us", path: "/contact-us" },
  { key: "about", path: "/about" },
  { key: "about-us", path: "/about-us" },
  { key: "team", path: "/team" },
  { key: "services", path: "/services" },
];

export type ProspectEnrichmentProvider = {
  id: "website_public";
  enrich(params: {
    contact: Contact;
    workspaceUserId: string;
    onProgress?: (step: number, total: number) => Promise<void>;
  }): Promise<ProspectEnrichmentResult>;
};

function mergeContacts(...parts: ProspectPublicContacts[]): ProspectPublicContacts {
  const emails = new Set<string>();
  const phones = new Set<string>();
  const whatsappNumbers = new Set<string>();
  const socialProfiles = new Set<string>();
  const bookingUrls = new Set<string>();
  const contactPageUrls = new Set<string>();
  for (const p of parts) {
    p.emails.forEach((e) => emails.add(e));
    p.phones.forEach((e) => phones.add(e));
    p.whatsappNumbers.forEach((e) => whatsappNumbers.add(e));
    p.socialProfiles.forEach((e) => socialProfiles.add(e));
    p.bookingUrls.forEach((e) => bookingUrls.add(e));
    p.contactPageUrls.forEach((e) => contactPageUrls.add(e));
  }
  return {
    emails: [...emails],
    phones: [...phones],
    whatsappNumbers: [...whatsappNumbers],
    socialProfiles: [...socialProfiles],
    bookingUrls: [...bookingUrls],
    contactPageUrls: [...contactPageUrls],
  };
}

function buildGuidedUrls(homepage: string): Array<{ key: string; url: string }> {
  const base = new URL(homepage);
  const origin = `${base.protocol}//${base.host}`;
  const urls: Array<{ key: string; url: string }> = [{ key: "home", url: origin + "/" }];
  for (const p of GUIDED_PATHS) {
    if (p.key === "home") continue;
    urls.push({ key: p.key, url: origin + p.path });
  }
  // Also try homepage path as given if not root
  if (base.pathname && base.pathname !== "/") {
    urls.unshift({ key: "listed", url: homepage });
  }
  // Dedupe
  const seen = new Set<string>();
  return urls.filter((u) => {
    const k = u.url.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function summarizeWebsiteWithAi(params: {
  contact: Contact;
  workspaceUserId: string;
  websiteUrl: string;
  combinedText: string;
  signals: ReturnType<typeof detectWebsiteSignals>;
  publicContacts: ProspectPublicContacts;
}): Promise<ProspectWebsiteIntelligence> {
  const workspace = await loadProspectAiWorkspaceContext(params.workspaceUserId, {
    contactId: params.contact.id,
    analysisPath: "enrichment_summary",
  });
  const meta = readProspectImportMetadata(params.contact);
  const system = `You are Prospect AI enrichment. Summarize ONLY from the scraped website text and provided structured facts.
Never invent emails, phones, or facts not present.
Prefer AI Brain workspace context for why the sender's offer fits — do not confuse prospect industry with what the sender sells.
Return strict JSON only.`;

  const user = JSON.stringify(
    {
      prospectName: params.contact.name,
      websiteUrl: params.websiteUrl,
      batchName: meta?.batchName || null,
      publicContactsFound: params.publicContacts,
      signals: params.signals,
      workspaceOfferContext: workspace.aiBrainIsPrimary
        ? {
            productsAndServices: workspace.servicesProducts,
            websiteKnowledge: workspace.websiteKnowledgeSummary,
            executiveSummary: workspace.executiveSummary,
          }
        : workspace.configured
          ? { profileAbout: workspace.aboutText, company: workspace.businessName }
          : null,
      scrapedWebsiteText: params.combinedText.slice(0, 28000),
    },
    null,
    2,
  );

  try {
    const response = await aiProvider.complete(
      "extraction",
      [
        { role: "system", content: system },
        {
          role: "user",
          content: `${user}

Return JSON:
{
  "businessSummary": string,
  "productsServices": string,
  "industry": string,
  "targetCustomers": string,
  "companySizeClues": string,
  "appointmentOrBookingFlow": string,
  "ctaStyle": string,
  "aiFitInsights": string,
  "recommendedOutreachAngle": string,
  "painPoints": string[],
  "whyWhachatRelevant": string[]
}`,
        },
      ],
      { jsonMode: true, maxTokens: 1200, returnUsage: true },
    );
    const content = typeof response === "string" ? response : response.content;
    const raw = JSON.parse(content || "{}") as Record<string, unknown>;
    return {
      businessSummary: typeof raw.businessSummary === "string" ? raw.businessSummary.slice(0, 800) : undefined,
      productsServices:
        typeof raw.productsServices === "string" ? raw.productsServices.slice(0, 500) : undefined,
      industry: typeof raw.industry === "string" ? raw.industry.slice(0, 120) : undefined,
      targetCustomers:
        typeof raw.targetCustomers === "string" ? raw.targetCustomers.slice(0, 400) : undefined,
      companySizeClues:
        typeof raw.companySizeClues === "string" ? raw.companySizeClues.slice(0, 200) : undefined,
      appointmentOrBookingFlow:
        typeof raw.appointmentOrBookingFlow === "string"
          ? raw.appointmentOrBookingFlow.slice(0, 300)
          : undefined,
      ctaStyle: typeof raw.ctaStyle === "string" ? raw.ctaStyle.slice(0, 200) : undefined,
      aiFitInsights: typeof raw.aiFitInsights === "string" ? raw.aiFitInsights.slice(0, 600) : undefined,
      recommendedOutreachAngle:
        typeof raw.recommendedOutreachAngle === "string"
          ? raw.recommendedOutreachAngle.slice(0, 400)
          : undefined,
      painPoints: Array.isArray(raw.painPoints)
        ? raw.painPoints.filter((x): x is string => typeof x === "string").slice(0, 8)
        : [],
      whyWhachatRelevant: Array.isArray(raw.whyWhachatRelevant)
        ? raw.whyWhachatRelevant.filter((x): x is string => typeof x === "string").slice(0, 8)
        : [],
      chatWidgetDetected: params.signals.chatWidgetDetected,
      whatsappButtonDetected: params.signals.whatsappButtonDetected,
      contactFormsDetected: params.signals.contactFormsDetected,
      technologyClues: params.signals.technologyClues,
    };
  } catch (err) {
    console.error("[ProspectEnrichment] AI summary failed:", err instanceof Error ? err.message : err);
    return {
      businessSummary: params.combinedText.slice(0, 400) || undefined,
      chatWidgetDetected: params.signals.chatWidgetDetected,
      whatsappButtonDetected: params.signals.whatsappButtonDetected,
      contactFormsDetected: params.signals.contactFormsDetected,
      technologyClues: params.signals.technologyClues,
      aiFitInsights: "Website scanned; AI summary unavailable — review manually.",
    };
  }
}

export const websitePublicEnrichmentProvider: ProspectEnrichmentProvider = {
  id: "website_public",

  async enrich({ contact, workspaceUserId, onProgress }) {
    const total = 4;
    await onProgress?.(1, total);

    const websiteUrl = resolveProspectWebsiteUrl(contact);
    if (!websiteUrl) {
      return {
        provider: "website_public",
        websiteUrl: null,
        websiteAnalyzedAt: new Date().toISOString(),
        publicContacts: {
          emails: [],
          phones: [],
          whatsappNumbers: [],
          socialProfiles: [],
          bookingUrls: [],
          contactPageUrls: [],
        },
        websiteIntelligence: {
          businessSummary: "No public website URL available for this prospect.",
          pagesScanned: [],
        },
        emailFound: false,
        phoneFound: Boolean(String(contact.phone || "").trim()),
      };
    }

    await onProgress?.(2, total);
    const guided = buildGuidedUrls(websiteUrl);
    const pageResults: Array<{ url: string; status: string; reason?: string }> = [];
    let combinedText = "";
    let allHtml = "";
    let contacts = mergeContacts();

    for (const page of guided.slice(0, 8)) {
      try {
        const { finalUrl, html } = await fetchPublicHtmlPage(page.url);
        allHtml += `\n${html}`;
        const pageContacts = extractPublicContactsFromHtml(html, finalUrl);
        contacts = mergeContacts(contacts, pageContacts);
        const text = htmlToEnrichmentText(html, 12_000);
        combinedText += `\n\n--- ${page.key} — ${finalUrl} ---\n${text}`;
        pageResults.push({ url: finalUrl, status: "scanned" });
      } catch (err) {
        pageResults.push({
          url: page.url,
          status: "failed",
          reason: err instanceof Error ? err.message.slice(0, 120) : "fetch_failed",
        });
      }
      if (combinedText.length > 90_000) break;
    }

    await onProgress?.(3, total);
    const signals = detectWebsiteSignals(allHtml);
    const websiteIntelligence = await summarizeWebsiteWithAi({
      contact,
      workspaceUserId,
      websiteUrl,
      combinedText: combinedText.slice(0, 90_000),
      signals,
      publicContacts: contacts,
    });
    websiteIntelligence.pagesScanned = pageResults;

    await onProgress?.(4, total);

    // Prefer discovered public email/phone; never invent. Keep existing contact phone if found none.
    const emailFound = contacts.emails.length > 0;
    const phoneFound = contacts.phones.length > 0 || Boolean(String(contact.phone || "").trim());

    return {
      provider: "website_public",
      websiteUrl,
      websiteAnalyzedAt: new Date().toISOString(),
      publicContacts: contacts,
      websiteIntelligence,
      emailFound,
      phoneFound,
    };
  },
};

export function getProspectEnrichmentProvider(
  id: string = "website_public",
): ProspectEnrichmentProvider {
  if (id === "website_public") return websitePublicEnrichmentProvider;
  // Future: apollo, hunter, etc.
  return websitePublicEnrichmentProvider;
}
