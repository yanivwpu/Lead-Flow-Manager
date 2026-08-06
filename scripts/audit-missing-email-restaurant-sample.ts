/**
 * Classify a sample of Missing Email restaurant prospects after enrichment.
 * Read-only. Uses improved discovery + extraction (no writes).
 *
 * Run:
 *   npx tsx scripts/audit-missing-email-restaurant-sample.ts
 *   npx tsx scripts/audit-missing-email-restaurant-sample.ts --limit=26
 *   npx tsx scripts/audit-missing-email-restaurant-sample.ts --fixture-only
 */
import "dotenv/config";
import {
  extractPublicContactsFromHtml,
  selectBestProspectEmailDetailed,
} from "../server/prospectImport/prospectWebsiteContactExtract";
import {
  buildEnrichmentPageQueue,
  discoverEmailBearingUrlsFromHtml,
  mergeDiscoveredIntoQueue,
  PROSPECT_ENRICH_MAX_PAGES,
} from "../server/prospectImport/prospectWebsitePageDiscovery";
import { scoreLocationPageMatch } from "../server/prospectImport/prospectWebsiteLocationSignals";
import type { Contact } from "../shared/schema";

export type MissingEmailFailureClass =
  | "true_no_public_email"
  | "email_found_on_official_site_but_missed"
  | "dynamic_rendering_required"
  | "wrong_location_page"
  | "validation_rejected"
  | "crawl_failed"
  | "third_party_only";

type AuditRow = {
  name: string;
  websiteUrl: string;
  city?: string | null;
  phone?: string | null;
  address?: string | null;
  classification: MissingEmailFailureClass;
  emailsFound: string[];
  bestEmail: string | null;
  pagesOk: number;
  pagesFailed: number;
  notes: string;
};

async function fetchHtml(url: string): Promise<{ finalUrl: string; html: string } | null> {
  try {
    const { fetchPublicHtmlPage } = await import("../server/websiteKnowledgeScraper");
    return await fetchPublicHtmlPage(url);
  } catch (err) {
    return null;
  }
}

function looksJsOnly(html: string, textHintLen: number): boolean {
  if (textHintLen < 120) return true;
  return /__NEXT_DATA__|data-reactroot|id=["']root["'][^>]*>\s*<\/div>/i.test(html);
}

export async function auditProspectWebsite(params: {
  name: string;
  websiteUrl: string;
  city?: string | null;
  phone?: string | null;
  address?: string | null;
  postalCode?: string | null;
}): Promise<AuditRow> {
  const contact = {
    id: "audit",
    userId: "audit",
    name: params.name,
    email: null,
    phone: params.phone || null,
    sourceDetails: {
      prospectAi: {
        city: params.city || null,
        address: params.address || null,
        postalCode: params.postalCode || null,
      },
    },
    customFields: {},
  } as unknown as Contact;

  let pageQueue = buildEnrichmentPageQueue({
    homepage: params.websiteUrl,
    contact,
  });
  const seen = new Set(pageQueue.map((p) => p.url.toLowerCase().replace(/\/$/, "")));
  const emails = new Set<string>();
  const extractions: NonNullable<
    ReturnType<typeof extractPublicContactsFromHtml>["emailExtractions"]
  > = [];
  const locationScoreByUrl: Record<string, number> = {};
  let pagesOk = 0;
  let pagesFailed = 0;
  let jsHeavyHits = 0;
  let locationPageHit = false;
  let thirdPartyOnly = true;

  for (let i = 0; i < pageQueue.length && pagesOk + pagesFailed < PROSPECT_ENRICH_MAX_PAGES; i++) {
    const page = pageQueue[i]!;
    const fetched = await fetchHtml(page.url);
    if (!fetched) {
      pagesFailed += 1;
      continue;
    }
    pagesOk += 1;
    const loc = scoreLocationPageMatch(
      {
        city: params.city || null,
        address: params.address || null,
        postalCode: params.postalCode || null,
        phoneDigits: (params.phone || "").replace(/\D/g, "") || null,
        businessName: params.name,
        matchTokens: [],
      },
      fetched.finalUrl,
      fetched.html,
    );
    if (loc.score >= 40) locationPageHit = true;
    locationScoreByUrl[fetched.finalUrl.toLowerCase()] = loc.score;

    const textLen = fetched.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
    if (looksJsOnly(fetched.html, textLen)) jsHeavyHits += 1;

    const contacts = extractPublicContactsFromHtml(fetched.html, fetched.finalUrl);
    for (const e of contacts.emails) {
      emails.add(e.toLowerCase());
      try {
        const host = new URL(params.websiteUrl).hostname.replace(/^www\./, "");
        if (e.toLowerCase().endsWith(`@${host}`) || e.toLowerCase().includes(host.split(".").slice(-2).join("."))) {
          thirdPartyOnly = false;
        }
      } catch {
        /* ignore */
      }
    }
    for (const ex of contacts.emailExtractions || []) extractions.push(ex);

    if (page.key === "home" || page.key === "locations" || page.key === "listed") {
      const discovered = discoverEmailBearingUrlsFromHtml(fetched.html, fetched.finalUrl, {
        city: params.city || null,
        address: params.address || null,
        postalCode: params.postalCode || null,
        phoneDigits: (params.phone || "").replace(/\D/g, "") || null,
        businessName: params.name,
        matchTokens: [],
      });
      const fresh = discovered.filter((d) => {
        const k = d.url.toLowerCase().replace(/\/$/, "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (fresh.length) pageQueue = mergeDiscoveredIntoQueue(pageQueue, fresh);
    }
  }

  const best = selectBestProspectEmailDetailed([...emails], {
    websiteUrl: params.websiteUrl,
    extractions,
    locationScoreByUrl,
  });

  let classification: MissingEmailFailureClass = "true_no_public_email";
  let notes = "No public email found with improved static crawl.";

  if (pagesOk === 0) {
    classification = "crawl_failed";
    notes = "All page fetches failed.";
  } else if (best?.email) {
    classification = "email_found_on_official_site_but_missed";
    notes = `Improved crawl found ${best.email} via ${best.method || "unknown"} at ${best.sourceUrl || "n/a"}`;
    if (!locationPageHit && params.city) {
      classification = "wrong_location_page";
      notes += " (email found without strong location page match — may have been wrong-page miss before)";
    }
  } else if (emails.size > 0 && thirdPartyOnly) {
    classification = "third_party_only";
    notes = `Only third-party emails: ${[...emails].join(", ")}`;
  } else if (jsHeavyHits > 0 && emails.size === 0) {
    classification = "dynamic_rendering_required";
    notes = "JS-heavy pages with no static email — headless fallback may be required.";
  }

  return {
    name: params.name,
    websiteUrl: params.websiteUrl,
    city: params.city,
    phone: params.phone,
    address: params.address,
    classification,
    emailsFound: [...emails],
    bestEmail: best?.email || null,
    pagesOk,
    pagesFailed,
    notes,
  };
}

/** Known false-negative fixture for offline classification counts. */
const FIXTURE_SAMPLE: Array<Parameters<typeof auditProspectWebsite>[0] & { priorClass?: MissingEmailFailureClass }> = [
  {
    name: "Aromas del Peru — Pompano Beach",
    websiteUrl: "https://aromasperu.com/",
    city: "Pompano Beach",
    phone: "(954) 943-0550",
    address: "1357 S Federal Hwy, Pompano Beach, FL 33062",
    postalCode: "33062",
  },
];

function summarize(rows: AuditRow[]) {
  const counts: Record<MissingEmailFailureClass, number> = {
    true_no_public_email: 0,
    email_found_on_official_site_but_missed: 0,
    dynamic_rendering_required: 0,
    wrong_location_page: 0,
    validation_rejected: 0,
    crawl_failed: 0,
    third_party_only: 0,
  };
  for (const r of rows) counts[r.classification] += 1;
  const falseNeg =
    counts.email_found_on_official_site_but_missed +
    counts.wrong_location_page +
    counts.dynamic_rendering_required;
  const rate = rows.length ? falseNeg / rows.length : 0;
  return { counts, falseNegativeEstimate: falseNeg, falseNegativeRate: rate, sampleSize: rows.length };
}

async function loadDbSample(limit: number): Promise<Array<Parameters<typeof auditProspectWebsite>[0]>> {
  try {
    const { and, desc, eq, isNull, or, sql } = await import("drizzle-orm");
    const { db } = await import("../drizzle/db");
    const { contacts, prospectIntelligence } = await import("../shared/schema");

    const rows = await db
      .select({
        name: contacts.name,
        phone: contacts.phone,
        sourceDetails: contacts.sourceDetails,
        customFields: contacts.customFields,
        websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
        enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
        enrichmentStatus: prospectIntelligence.enrichmentStatus,
      })
      .from(contacts)
      .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
      .where(
        and(
          eq(prospectIntelligence.enrichmentStatus, "completed"),
          or(eq(prospectIntelligence.enrichmentEmailFound, false), isNull(prospectIntelligence.enrichmentEmailFound)),
          or(isNull(contacts.email), eq(contacts.email, "")),
          sql`coalesce(${prospectIntelligence.websiteUrlUsed}, '') <> ''`,
        ),
      )
      .orderBy(desc(prospectIntelligence.updatedAt))
      .limit(limit);

    return rows.map((r) => {
      const sd = (r.sourceDetails || {}) as Record<string, unknown>;
      const cf = (r.customFields || {}) as Record<string, unknown>;
      const pai = (sd.prospectAi || cf.prospectAi || {}) as Record<string, unknown>;
      return {
        name: r.name || "Unknown",
        websiteUrl: String(r.websiteUrlUsed),
        city: String(pai.city || cf.city || "") || null,
        phone: r.phone,
        address: String(pai.address || cf.address || "") || null,
        postalCode: String(pai.postalCode || pai.zip || "") || null,
      };
    });
  } catch (err) {
    console.warn("[audit] DB sample unavailable:", err instanceof Error ? err.message : err);
    return [];
  }
}

async function main() {
  const fixtureOnly = process.argv.includes("--fixture-only");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice(8)) || 26 : 26;

  const targets = fixtureOnly ? FIXTURE_SAMPLE : [...FIXTURE_SAMPLE, ...(await loadDbSample(limit))];
  // Dedupe by website+name
  const seen = new Set<string>();
  const unique = targets.filter((t) => {
    const k = `${t.name}|${t.websiteUrl}`.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, limit);

  console.log(JSON.stringify({ event: "audit_start", samplePlanned: unique.length }, null, 0));

  const rows: AuditRow[] = [];
  for (const t of unique) {
    const row = await auditProspectWebsite(t);
    rows.push(row);
    console.log(JSON.stringify({ event: "audit_row", ...row }));
  }

  const summary = summarize(rows);
  console.log(
    JSON.stringify(
      {
        event: "audit_summary",
        ...summary,
        highestImpactFixes: [
          "Crawl /locations + city location pages (not only /contact)",
          "Match prospect city/phone when ranking emails",
          "Optional headless render for JS-only contact blocks",
          "Extract JSON-LD / embedded JSON emails",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
