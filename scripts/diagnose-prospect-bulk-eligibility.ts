/**
 * Diagnostic script: reproduce bulk outreach eligibility for named prospects.
 * Safe fields only (no tokens/bodies).
 *
 * Usage: npx tsx scripts/diagnose-prospect-bulk-eligibility.ts
 */
import { db } from "../drizzle/db";
import { contacts, emailMailboxes, prospectIntelligence } from "@shared/schema";
import { eq, ilike, or, sql } from "drizzle-orm";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  loadWorkspaceChannelConnections,
  resolveProspectOutreachEligibilityForContact,
} from "../server/prospectImport/prospectOutreachEligibilityService";
import { isValidProspectEmail } from "../shared/prospectContactEnrichment";
import { resolveProspectOutreachEligibility } from "../shared/prospectOutreachEligibility";

const NAMES = ["outsmart", "solomon", "mariangel", "rojas"];

async function main() {
  const destinationUserId = await resolveProspectImportDestinationUserId();
  console.log(
    JSON.stringify({
      tag: "[DiagnoseBulkEligibility]",
      event: "destination_resolved",
      destinationUserIdPrefix: destinationUserId.slice(0, 8),
    }),
  );

  const mailboxes = await db
    .select({
      id: emailMailboxes.id,
      workspaceUserId: emailMailboxes.workspaceUserId,
      emailAddress: emailMailboxes.emailAddress,
      syncStatus: emailMailboxes.syncStatus,
      isPrimary: emailMailboxes.isPrimary,
    })
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, destinationUserId));

  console.log(
    JSON.stringify({
      tag: "[DiagnoseBulkEligibility]",
      event: "mailboxes_for_destination",
      count: mailboxes.length,
      mailboxes: mailboxes.map((m) => ({
        idPrefix: m.id.slice(0, 8),
        emailAddress: m.emailAddress,
        syncStatus: m.syncStatus,
        isPrimary: m.isPrimary,
      })),
    }),
  );

  // Also list any mailboxes (workspace prefix only) in case mismatch
  const allMb = await db
    .select({
      id: emailMailboxes.id,
      workspaceUserId: emailMailboxes.workspaceUserId,
      emailAddress: emailMailboxes.emailAddress,
      syncStatus: emailMailboxes.syncStatus,
    })
    .from(emailMailboxes)
    .limit(20);
  console.log(
    JSON.stringify({
      tag: "[DiagnoseBulkEligibility]",
      event: "mailboxes_sample",
      count: allMb.length,
      mailboxes: allMb.map((m) => ({
        idPrefix: m.id.slice(0, 8),
        workspaceMatch: m.workspaceUserId === destinationUserId,
        workspacePrefix: m.workspaceUserId.slice(0, 8),
        emailAddress: m.emailAddress,
        syncStatus: m.syncStatus,
      })),
    }),
  );

  const connections = await loadWorkspaceChannelConnections(destinationUserId);
  console.log(
    JSON.stringify({
      tag: "[DiagnoseBulkEligibility]",
      event: "connections",
      emailConnected: connections.emailConnected,
      emailMailboxIdPrefix: connections.emailMailboxId?.slice(0, 8) || null,
      smsConnected: connections.smsConnected,
      whatsappConnected: connections.whatsappConnected,
    }),
  );

  const nameFilter = or(
    ...NAMES.map((n) => ilike(contacts.name, `%${n}%`)),
  );
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      email: contacts.email,
      userId: contacts.userId,
      phone: contacts.phone,
    })
    .from(contacts)
    .where(nameFilter)
    .limit(20);

  for (const c of rows) {
    const pi = await db
      .select({
        reviewStatus: prospectIntelligence.reviewStatus,
        outreachStatus: prospectIntelligence.outreachStatus,
        analysisStatus: prospectIntelligence.analysisStatus,
        needsReview: prospectIntelligence.needsReview,
        hasMessage: sql<boolean>`coalesce(length(trim(${prospectIntelligence.suggestedFirstMessage})), 0) > 0`,
      })
      .from(prospectIntelligence)
      .where(eq(prospectIntelligence.contactId, c.id))
      .limit(1);

    const full = await (await import("../server/storage")).storage.getContact(c.id);
    if (!full) continue;

    const { result, input } = await resolveProspectOutreachEligibilityForContact({
      contact: full,
      workspaceUserId: destinationUserId,
      preferredChannel: "auto",
      connections,
    });

    // Also compute what summary WOULD be with email channel reason
    const emailCh = result.channels.email;

    console.log(
      JSON.stringify({
        tag: "[DiagnoseBulkEligibility]",
        event: "prospect_eligibility",
        contactIdPrefix: c.id.slice(0, 8),
        name: c.name,
        contactUserMatch: c.userId === destinationUserId,
        emailRaw: c.email,
        emailValid: isValidProspectEmail(c.email),
        pi: pi[0] || null,
        inputFlags: {
          emailConnected: input.emailConnected,
          reviewStatus: input.reviewStatus,
          outreachStatus: input.outreachStatus,
          analysisStatus: input.analysisStatus,
          needsReview: input.needsReview,
          alreadyQueued: input.alreadyQueued,
          suppressed: input.suppressed,
          preferredChannel: input.preferredChannel,
        },
        emailChannel: {
          eligible: emailCh.eligible,
          technicallyAvailable: emailCh.technicallyAvailable,
          connected: emailCh.connected,
          policyEligible: emailCh.policyEligible,
          reason: emailCh.reason,
          detail: emailCh.detail,
        },
        summaryReason: result.summaryReason,
        selectedChannel: result.selectedChannel,
        anyEligible: result.anyEligible,
      }),
    );
  }

  // Pure resolver fixture mirroring the passing unit test
  const fixture = resolveProspectOutreachEligibility({
    email: "a@example.com",
    emailConnected: true,
    reviewStatus: "approved",
    outreachStatus: "not_sent",
    analysisStatus: "completed",
    preferredChannel: "auto",
  });
  console.log(
    JSON.stringify({
      tag: "[DiagnoseBulkEligibility]",
      event: "fixture_parity",
      fixtureEligible: fixture.anyEligible,
      fixtureSelected: fixture.selectedChannel,
      fixtureEmailReason: fixture.channels.email.reason,
    }),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
