import "dotenv/config";
import { writeFileSync } from "fs";
import { eq, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectIntelligence } from "../shared/schema";
import { resolveProspectWebsiteUrl } from "../server/prospectImport/prospectWebsiteUrl";

async function main() {
  const ids = [
    "c96da188-5441-44d0-a417-96ec9114246c",
    "78b74fc8-1ee0-4a26-b285-7c8440cc15e3",
  ];
  const rows = await db
    .select({
      name: contacts.name,
      notes: contacts.notes,
      sourceDetails: contacts.sourceDetails,
      customFields: contacts.customFields,
      websiteUrlUsed: prospectIntelligence.websiteUrlUsed,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
      enrichmentResult: prospectIntelligence.enrichmentResult,
      enrichmentErrorMessage: prospectIntelligence.enrichmentErrorMessage,
      reviewStatus: prospectIntelligence.reviewStatus,
      analysisStatus: prospectIntelligence.analysisStatus,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(inArray(contacts.id, ids));

  const out = rows.map((r) => ({
    name: r.name,
    resolvedWebsite: resolveProspectWebsiteUrl({
      notes: r.notes,
      sourceDetails: r.sourceDetails as Record<string, unknown> | null,
      customFields: r.customFields as Record<string, unknown> | null,
    } as any),
    websiteUrlUsed: r.websiteUrlUsed,
    enrichmentStatus: r.enrichmentStatus,
    enrichmentErrorMessage: r.enrichmentErrorMessage,
    reviewStatus: r.reviewStatus,
    analysisStatus: r.analysisStatus,
    enrichmentResult: r.enrichmentResult,
  }));
  writeFileSync("audit-no-website.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.map((o) => ({ name: o.name, resolved: o.resolvedWebsite, used: o.websiteUrlUsed, summary: (o.enrichmentResult as any)?.websiteIntelligence?.businessSummary })), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
