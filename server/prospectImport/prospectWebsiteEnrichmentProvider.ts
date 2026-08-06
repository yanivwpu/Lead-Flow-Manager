/**
 * Website-public enrichment provider (Phase 2).
 * Crawls prospect homepage + contact/location pages; extracts public contacts; AI summarizes.
 * Future Apollo/Hunter providers implement the same interface.
 */

import type { Contact } from "@shared/schema";
import type {
  ProspectEmailProvenance,
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
  selectBestProspectEmailDetailed,
  type ProspectExtractedEmail,
} from "./prospectWebsiteContactExtract";
import { resolveProspectSocialProfileUrls } from "./prospectWebsiteUrl";
import { recoverOfficialWebsiteForEnrichment } from "./prospectOfficialWebsiteRecovery";
import { loadProspectAiWorkspaceContext } from "./prospectAiWorkspaceContext";
import { readProspectImportMetadata } from "./prospectIntelligenceEligibility";
import { classifyAllPagesFailed } from "@shared/prospectEnrichmentOutcome";
import type { ProspectEnrichmentFailureClass } from "@shared/prospectEnrichment";
import {
  buildEnrichmentPageQueue,
  discoverEmailBearingUrlsFromHtml,
  mergeDiscoveredIntoQueue,
  pageLooksJavaScriptHeavy,
  PROSPECT_ENRICH_MAX_COMBINED_TEXT,
  PROSPECT_ENRICH_MAX_PAGES,
  type EnrichmentPageCandidate,
} from "./prospectWebsitePageDiscovery";
import {
  readProspectLocationSignals,
  scoreLocationPageMatch,
} from "./prospectWebsiteLocationSignals";
import {
  isProspectEnrichmentHeadlessEnabled,
  PROSPECT_ENRICH_MAX_RENDER_PAGES,
  renderPageHtmlForEnrichment,
} from "./prospectWebsiteRenderFallback";

export {
  resolveProspectWebsiteUrl,
  resolveProspectOfficialWebsiteUrl,
  resolveProspectSocialProfileUrls,
} from "./prospectWebsiteUrl";

function emptyPublicContacts(socialProfiles: string[] = []): ProspectPublicContacts {
  return {
    emails: [],
    phones: [],
    whatsappNumbers: [],
    socialProfiles,
    bookingUrls: [],
    contactPageUrls: [],
  };
}

function failureResult(params: {
  websiteUrl: string | null;
  failureClass: ProspectEnrichmentFailureClass;
  socialProfiles?: string[];
  pagesScanned?: Array<{ url: string; status: string; reason?: string }>;
  phoneFound?: boolean;
  summary?: string;
}): ProspectEnrichmentResult {
  const outcomeClass =
    params.failureClass === "website_timeout"
      ? "failed_timeout"
      : params.failureClass === "no_website"
        ? "no_website"
        : params.failureClass === "social_profile_only"
          ? "social_profile_only"
          : "failed_fetch";
  return {
    provider: "website_public",
    websiteUrl: params.websiteUrl,
    websiteAnalyzedAt: new Date().toISOString(),
    publicContacts: emptyPublicContacts(params.socialProfiles || []),
    websiteIntelligence: {
      businessSummary: params.summary,
      pagesScanned: params.pagesScanned || [],
    },
    emailFound: false,
    phoneFound: Boolean(params.phoneFound),
    crawlSucceeded: false,
    failureClass: params.failureClass,
    outcomeClass,
    socialProfilesPreserved: params.socialProfiles || [],
    bestEmailProvenance: null,
  };
}

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
  const emailExtractions: NonNullable<ProspectPublicContacts["emailExtractions"]> = [];
  const seenExtraction = new Set<string>();
  for (const p of parts) {
    p.emails.forEach((e) => emails.add(e.toLowerCase()));
    p.phones.forEach((e) => phones.add(e));
    p.whatsappNumbers.forEach((e) => whatsappNumbers.add(e));
    p.socialProfiles.forEach((e) => socialProfiles.add(e));
    p.bookingUrls.forEach((e) => bookingUrls.add(e));
    p.contactPageUrls.forEach((e) => contactPageUrls.add(e));
    for (const ex of p.emailExtractions || []) {
      const key = ex.email.toLowerCase();
      if (seenExtraction.has(key)) continue;
      seenExtraction.add(key);
      emailExtractions.push({ ...ex, email: key });
    }
  }
  return {
    emails: [...emails],
    phones: [...phones],
    whatsappNumbers: [...whatsappNumbers],
    socialProfiles: [...socialProfiles],
    bookingUrls: [...bookingUrls],
    contactPageUrls: [...contactPageUrls],
    emailExtractions: emailExtractions.length ? emailExtractions : undefined,
  };
}

function annotateExtractionsWithLocation(
  extractions: ProspectExtractedEmail[] | undefined,
  pageUrl: string,
  locationScore: number,
  locationEvidence: string[],
): ProspectExtractedEmail[] {
  return (extractions || []).map((ex) => ({
    ...ex,
    sourceUrl: ex.sourceUrl || pageUrl,
    matchedLocationEvidence:
      locationScore > 0
        ? [...(ex.matchedLocationEvidence || []), ...locationEvidence]
        : ex.matchedLocationEvidence,
    confidence: Math.max(ex.confidence || 40, locationScore >= 40 ? 75 : 50),
  }));
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
For recommendedOutreachAngle / whyWhachatRelevant / aiFitInsights: reason prospect business → pain → 1–2 relevant WhachatCRM capabilities (prospecting, qualification, outreach automation, WhatsApp Business API, messaging channels, unified conversations, CRM follow-up). Do NOT default to analytics/insights positioning.
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

    const recovered = await recoverOfficialWebsiteForEnrichment(contact);
    const socialProfiles = recovered.socialProfiles.length
      ? recovered.socialProfiles
      : resolveProspectSocialProfileUrls(contact);
    const phoneOnContact = Boolean(String(contact.phone || "").trim());
    const locationSignals = readProspectLocationSignals(contact);

    if (!recovered.websiteUrl) {
      if (socialProfiles.length || recovered.reason === "social_only") {
        return failureResult({
          websiteUrl: socialProfiles[0] || null,
          failureClass: "social_profile_only",
          socialProfiles,
          phoneFound: phoneOnContact,
          summary: "Social profile only — add an official website to enrich contacts.",
        });
      }
      return failureResult({
        websiteUrl: null,
        failureClass: "no_website",
        socialProfiles,
        phoneFound: phoneOnContact,
        summary: "No public website URL available for this prospect.",
      });
    }

    const websiteUrl = recovered.websiteUrl;

    await onProgress?.(2, total);
    let pageQueue = buildEnrichmentPageQueue({ homepage: websiteUrl, contact });
    const queuedUrls = new Set(pageQueue.map((p) => p.url.toLowerCase().replace(/\/$/, "")));
    const pageResults: Array<{ url: string; status: string; reason?: string }> = [];
    const locationScoreByUrl: Record<string, number> = {};
    let combinedText = "";
    let allHtml = "";
    let contacts = mergeContacts(emptyPublicContacts(socialProfiles));
    let scannedCount = 0;
    let failedCount = 0;
    const renderCandidates: EnrichmentPageCandidate[] = [];
    const renderPages: string[] = [];
    let renderFallbackUsed = false;

    for (let i = 0; i < pageQueue.length && scannedCount + failedCount < PROSPECT_ENRICH_MAX_PAGES; i++) {
      const page = pageQueue[i]!;
      try {
        const { finalUrl, html } = await fetchPublicHtmlPage(page.url);
        allHtml += `\n${html}`;
        const loc = scoreLocationPageMatch(locationSignals, finalUrl, html);
        const locationScore = Math.max(page.locationScore, loc.score);
        const locationEvidence = [...page.locationEvidence, ...loc.evidence];
        locationScoreByUrl[finalUrl.toLowerCase()] = locationScore;
        locationScoreByUrl[finalUrl.toLowerCase().replace(/\/$/, "")] = locationScore;

        const pageContacts = extractPublicContactsFromHtml(html, finalUrl);
        const annotated: ProspectPublicContacts = {
          ...pageContacts,
          emailExtractions: annotateExtractionsWithLocation(
            pageContacts.emailExtractions as ProspectExtractedEmail[] | undefined,
            finalUrl,
            locationScore,
            locationEvidence,
          ),
        };
        contacts = mergeContacts(contacts, annotated);
        const text = htmlToEnrichmentText(html, 12_000);
        combinedText += `\n\n--- ${page.key} — ${finalUrl} ---\n${text}`;
        pageResults.push({ url: finalUrl, status: "scanned" });
        scannedCount += 1;

        if (pageLooksJavaScriptHeavy(html, text.length) && locationScore >= 40) {
          renderCandidates.push({ ...page, url: finalUrl, locationScore, locationEvidence });
        } else if (
          pageLooksJavaScriptHeavy(html, text.length) &&
          (page.key.includes("contact") || page.key.includes("location") || page.key === "home")
        ) {
          renderCandidates.push({ ...page, url: finalUrl, locationScore, locationEvidence });
        }

        // Discover contact/location links from home/listed/locations hubs.
        if (
          page.key === "home" ||
          page.key === "listed" ||
          page.key === "locations" ||
          page.key === "location"
        ) {
          const discovered = discoverEmailBearingUrlsFromHtml(html, finalUrl, locationSignals);
          const fresh = discovered.filter((d) => {
            const key = d.url.toLowerCase().replace(/\/$/, "");
            if (queuedUrls.has(key)) return false;
            queuedUrls.add(key);
            return true;
          });
          if (fresh.length) {
            pageQueue = mergeDiscoveredIntoQueue(pageQueue, fresh);
          }
        }
      } catch (err) {
        failedCount += 1;
        pageResults.push({
          url: page.url,
          status: "failed",
          reason: err instanceof Error ? err.message.slice(0, 120) : "fetch_failed",
        });
      }
      if (combinedText.length > PROSPECT_ENRICH_MAX_COMBINED_TEXT) break;
      if (contacts.emails.length > 0 && scannedCount >= 3 && locationSignals.city) {
        // Early stop once we have an on-domain email from a strong location match.
        const strong = (contacts.emailExtractions || []).some(
          (ex) => (ex.matchedLocationEvidence || []).length > 0,
        );
        if (strong) break;
      }
    }

    // Headless fallback — only when static crawl found no email and pages look JS-heavy.
    if (
      contacts.emails.length === 0 &&
      isProspectEnrichmentHeadlessEnabled() &&
      renderCandidates.length > 0
    ) {
      const uniqueRender = new Map<string, EnrichmentPageCandidate>();
      for (const c of [...renderCandidates].sort((a, b) => b.locationScore - a.locationScore)) {
        const k = c.url.toLowerCase();
        if (!uniqueRender.has(k)) uniqueRender.set(k, c);
      }
      let rendered = 0;
      for (const cand of uniqueRender.values()) {
        if (rendered >= PROSPECT_ENRICH_MAX_RENDER_PAGES) break;
        const html = await renderPageHtmlForEnrichment(cand.url);
        rendered += 1;
        renderFallbackUsed = true;
        renderPages.push(cand.url);
        if (!html) {
          pageResults.push({ url: cand.url, status: "render_failed", reason: "headless_unavailable_or_timeout" });
          continue;
        }
        const loc = scoreLocationPageMatch(locationSignals, cand.url, html);
        locationScoreByUrl[cand.url.toLowerCase()] = Math.max(cand.locationScore, loc.score);
        const pageContacts = extractPublicContactsFromHtml(html, cand.url);
        const withMethod: ProspectPublicContacts = {
          ...pageContacts,
          emailExtractions: (pageContacts.emailExtractions || []).map((ex) => ({
            ...ex,
            method: "rendered_dom" as const,
            sourceUrl: cand.url,
            matchedLocationEvidence: [...(ex.matchedLocationEvidence || []), ...loc.evidence],
            confidence: 80,
          })),
        };
        contacts = mergeContacts(contacts, withMethod);
        pageResults.push({ url: cand.url, status: "rendered" });
        if (contacts.emails.length > 0) break;
      }
    }

    const anyScanned = pageResults.some((p) => p.status === "scanned" || p.status === "rendered");
    if (!anyScanned || !String(allHtml || "").trim()) {
      const failureClass = classifyAllPagesFailed(pageResults);
      return failureResult({
        websiteUrl,
        failureClass,
        socialProfiles,
        pagesScanned: pageResults,
        phoneFound: phoneOnContact,
        summary: "Website pages could not be loaded for enrichment.",
      });
    }

    await onProgress?.(3, total);
    const signals = detectWebsiteSignals(allHtml);
    const websiteIntelligence = await summarizeWebsiteWithAi({
      contact,
      workspaceUserId,
      websiteUrl,
      combinedText: combinedText.slice(0, PROSPECT_ENRICH_MAX_COMBINED_TEXT),
      signals,
      publicContacts: contacts,
    });
    websiteIntelligence.pagesScanned = pageResults;

    await onProgress?.(4, total);

    const best = selectBestProspectEmailDetailed(contacts.emails, {
      websiteUrl,
      extractions: contacts.emailExtractions,
      locationScoreByUrl,
    });
    if (best) {
      contacts = {
        ...contacts,
        emails: [best.email, ...contacts.emails.filter((e) => e.toLowerCase() !== best.email)],
      };
    }

    const emailFound = contacts.emails.length > 0;
    const phoneFound = contacts.phones.length > 0 || phoneOnContact;
    const renderFailed =
      renderFallbackUsed && renderPages.length > 0 && !emailFound &&
      pageResults.some((p) => p.status === "render_failed");
    const searchIncomplete =
      !emailFound &&
      ((failedCount > 0 && scannedCount > 0) || renderFailed);
    const provenance: ProspectEmailProvenance | null = best
      ? {
          email: best.email,
          sourceUrl: best.sourceUrl || null,
          method: best.method || null,
          confidence: best.confidence,
          matchedLocationEvidence: best.matchedLocationEvidence || [],
        }
      : null;

    return {
      provider: "website_public",
      websiteUrl,
      websiteAnalyzedAt: new Date().toISOString(),
      publicContacts: contacts,
      websiteIntelligence,
      emailFound,
      phoneFound,
      crawlSucceeded: true,
      failureClass: null,
      outcomeClass: emailFound
        ? "completed_email_found"
        : searchIncomplete
          ? "completed_search_incomplete"
          : "completed_no_email",
      socialProfilesPreserved: socialProfiles,
      bestEmailProvenance: provenance,
      renderFallbackUsed,
      renderPages: renderPages.length ? renderPages : undefined,
    };
  },
};

export function getProspectEnrichmentProvider(
  id: string = "website_public",
): ProspectEnrichmentProvider {
  if (id === "website_public") return websitePublicEnrichmentProvider;
  return websitePublicEnrichmentProvider;
}
