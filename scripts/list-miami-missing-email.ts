/**
 * List Miami completed-enrichment prospects still missing email (read-only).
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectIntelligence } from "../shared/schema";

async function main() {
  const rows = await db
    .select({
      name: contacts.name,
      contactId: contacts.id,
      email: contacts.email,
      phone: contacts.phone,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentEmailFound: prospectIntelligence.enrichmentEmailFound,
      enrichmentPhoneFound: prospectIntelligence.enrichmentPhoneFound,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      enrichmentResult: prospectIntelligence.enrichmentResult,
      websiteAnalyzedAt: prospectIntelligence.websiteAnalyzedAt,
      reviewStatus: prospectIntelligence.reviewStatus,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(
      and(
        or(isNull(contacts.email), eq(contacts.email, "")),
        eq(prospectIntelligence.enrichmentStatus, "completed"),
        eq(prospectIntelligence.enrichmentEmailFound, false),
        or(
          ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, "%Miami%"),
          ilike(contacts.name, "%Miami%"),
          ilike(sql`coalesce(${contacts.notes}, '')`, "%Miami%"),
        ),
      ),
    )
    .orderBy(desc(prospectIntelligence.websiteAnalyzedAt))
    .limit(50);

  const summary = rows.map((r) => {
    const er = (r.enrichmentResult || {}) as Record<string, unknown>;
    const wi = (er.websiteIntelligence || {}) as { pagesScanned?: Array<{ status?: string; reason?: string; url?: string }> };
    const pages = wi.pagesScanned || [];
    const pc = (er.publicContacts || {}) as { emails?: string[] };
    const emails = pc.emails || [];
    const scanned = pages.filter((p) => p.status === "scanned").length;
    const failed = pages.filter((p) => p.status === "failed").length;
    const reasons = [
      ...new Set(pages.filter((p) => p.status === "failed").map((p) => p.reason).filter(Boolean)),
    ];
    let host = r.websiteUrlUsed || "";
    try {
      host = new URL(r.websiteUrlUsed || "").hostname;
    } catch {
      /* keep */
    }
    const url = String(r.websiteUrlUsed || "");
    return {
      name: r.name,
      contactId: r.contactId,
      host,
      websiteUrlUsed: r.websiteUrlUsed,
      phoneOnContact: Boolean(String(r.phone || "").trim()),
      enrichmentPhoneFound: r.enrichmentPhoneFound,
      emailsStored: emails,
      pagesScannedOk: scanned,
      pagesFailed: failed,
      failReasons: reasons,
      isSocial: /facebook|instagram|linkedin|twitter|x\.com|yelp|maps\.google/i.test(url),
      reviewStatus: r.reviewStatus,
      websiteAnalyzedAt: r.websiteAnalyzedAt,
    };
  });

  const out = {
    count: summary.length,
    socialCount: summary.filter((s) => s.isSocial).length,
    allPagesFailed: summary.filter((s) => s.pagesScannedOk === 0 && s.pagesFailed > 0).length,
    summary,
  };
  writeFileSync("audit-miami-batch.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ count: out.count, socialCount: out.socialCount, allPagesFailed: out.allPagesFailed }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
