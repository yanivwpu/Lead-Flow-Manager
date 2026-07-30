/**
 * Repair Prospect AI Review qualification decisions wiped by post-enrichment reanalyze.
 *
 * Restores reviewStatus=approved when clear legacy approval evidence exists:
 * - approvedAt set, and/or
 * - approvedByUserId set
 *
 * Also clears AI `not_a_fit` overwrites when approval evidence remains
 * (human Approve must win over later AI not_a_fit).
 *
 * Does NOT qualify prospects merely because they are enriched or have email.
 * Idempotent. Defaults to dry-run.
 *
 * Dry-run:  npx tsx scripts/repair-prospect-qualification-decisions.ts
 * Apply:    npx tsx scripts/repair-prospect-qualification-decisions.ts --apply
 * Scope:    optional --miami to limit to Miami-like contacts
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { contacts, prospectIntelligence } from "../shared/schema";

const APPLY = process.argv.includes("--apply");
const MIAMI_ONLY = process.argv.includes("--miami");

async function main() {
  const where = and(
    or(
      sql`${prospectIntelligence.approvedAt} is not null`,
      sql`${prospectIntelligence.approvedByUserId} is not null`,
    ),
    or(
      sql`lower(coalesce(${prospectIntelligence.reviewStatus}, '')) <> 'approved'`,
      sql`lower(coalesce(${prospectIntelligence.recommendedOffer}, '')) = 'not_a_fit'`,
    ),
    MIAMI_ONLY
      ? or(
          ilike(sql`coalesce(${contacts.sourceDetails}::text, '')`, "%Miami%"),
          ilike(contacts.name, "%Miami%"),
          ilike(sql`coalesce(${contacts.notes}, '')`, "%Miami%"),
        )
      : sql`true`,
  );

  const candidates = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      reviewStatus: prospectIntelligence.reviewStatus,
      needsReview: prospectIntelligence.needsReview,
      recommendedOffer: prospectIntelligence.recommendedOffer,
      approvedAt: prospectIntelligence.approvedAt,
      approvedByUserId: prospectIntelligence.approvedByUserId,
      enrichmentTriggeredBy: prospectIntelligence.enrichmentTriggeredBy,
      enrichmentStatus: prospectIntelligence.enrichmentStatus,
    })
    .from(contacts)
    .innerJoin(prospectIntelligence, eq(prospectIntelligence.contactId, contacts.id))
    .where(where)
    .limit(5000);

  const plan = candidates.map((r) => {
    const reasons: string[] = [];
    if (r.approvedAt) reasons.push("approvedAt_set");
    if (r.approvedByUserId) reasons.push("approvedByUserId_set");
    if (String(r.enrichmentTriggeredBy || "").toLowerCase() === "approve") {
      reasons.push("enrichmentTriggeredBy_approve");
    }
    const offer = String(r.recommendedOffer || "").toLowerCase();
    if (offer === "not_a_fit") reasons.push("clear_ai_not_a_fit_overwrite");
    if (String(r.reviewStatus || "").toLowerCase() !== "approved") {
      reasons.push("restore_reviewStatus_approved");
    }
    return {
      contactId: r.contactId,
      name: r.name,
      before: {
        reviewStatus: r.reviewStatus,
        recommendedOffer: r.recommendedOffer,
        needsReview: r.needsReview,
        enrichmentStatus: r.enrichmentStatus,
      },
      after: {
        reviewStatus: "approved",
        recommendedOffer: offer === "not_a_fit" ? "general_demo" : r.recommendedOffer,
        needsReview: false,
      },
      reasons,
    };
  });

  const out = {
    mode: APPLY ? "apply" : "dry-run",
    miamiOnly: MIAMI_ONLY,
    count: plan.length,
    plan,
  };
  writeFileSync("repair-prospect-qualification-dry-run.json", JSON.stringify(out, null, 2));

  if (!APPLY) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          miamiOnly: MIAMI_ONLY,
          count: plan.length,
          sample: plan.slice(0, 8),
          wrote: "repair-prospect-qualification-dry-run.json",
        },
        null,
        2,
      ),
    );
    return;
  }

  let updated = 0;
  for (const row of plan) {
    const clearOffer = String(row.before.recommendedOffer || "").toLowerCase() === "not_a_fit";
    await db
      .update(prospectIntelligence)
      .set({
        reviewStatus: "approved",
        needsReview: false,
        ...(clearOffer ? { recommendedOffer: "general_demo" } : {}),
        updatedAt: new Date(),
      })
      .where(eq(prospectIntelligence.contactId, row.contactId));
    updated += 1;
  }

  console.log(JSON.stringify({ mode: "apply", requested: plan.length, updated }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
