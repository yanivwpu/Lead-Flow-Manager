/**
 * Live audit: homemiamire.com fetch + extract (read-only; no Places/quota).
 * Run: npx tsx scripts/audit-homemiami-email-enrichment.ts
 */
import "dotenv/config";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectIntelligence } from "../shared/schema";
import { fetchPublicHtmlPage } from "../server/websiteKnowledgeScraper";
import {
  extractEmailsFromHtml,
  extractPublicContactsFromHtml,
  selectBestProspectEmail,
} from "../server/prospectImport/prospectWebsiteContactExtract";
import { resolveProspectWebsiteUrl } from "../server/prospectImport/prospectWebsiteUrl";

async function main() {
  const urls = ["https://homemiamire.com", "https://www.homemiamire.com"];

  const fetchResults: Array<Record<string, unknown>> = [];
  for (const url of urls) {
    try {
      const page = await fetchPublicHtmlPage(url);
      const emails = extractEmailsFromHtml(page.html || "", page.finalUrl || url);
      const contactsFound = extractPublicContactsFromHtml(page.html || "", page.finalUrl || url);
      const best = selectBestProspectEmail(contactsFound.emails, {
        websiteUrl: page.finalUrl || url,
        extractions: contactsFound.emailExtractions,
      });
      fetchResults.push({
        requestedUrl: url,
        ok: true,
        finalUrl: page.finalUrl,
        htmlLen: (page.html || "").length,
        hasMailtoInfo: /mailto:\s*info@homemiamire\.com/i.test(page.html || ""),
        extractedEmails: emails,
        bestEmail: best,
      });
    } catch (err) {
      fetchResults.push({
        requestedUrl: url,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const miami = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      email: contacts.email,
      notes: contacts.notes,
      sourceDetails: contacts.sourceDetails,
      customFields: contacts.customFields,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      analysisStatus: prospectIntelligence.analysisStatus,
    })
    .from(contacts)
    .leftJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      or(
        ilike(contacts.name, "%Home Miami%"),
        ilike(contacts.notes, "%homemiamire%"),
        sql`coalesce(${contacts.sourceDetails}::text, '') ilike '%homemiamire%'`,
      ),
    )
    .orderBy(desc(prospectIntelligence.updatedAt))
    .limit(3);

  console.log(
    JSON.stringify(
      {
        fetchResults,
        miamiRows: miami.map((r) => ({
          name: r.name,
          contactEmail: r.email,
          enrichmentStatus: r.enrichmentStatus,
          websiteUrlUsed: r.websiteUrlUsed,
          enrichmentEmailFound: r.enrichmentEmailFound,
          resolvedWebsite: resolveProspectWebsiteUrl({
            notes: r.notes,
            sourceDetails: r.sourceDetails as Record<string, unknown> | null,
            customFields: r.customFields as Record<string, unknown> | null,
          }),
          analysisStatus: r.analysisStatus,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
