/**
 * Read-only Gmail/native-email contact lifecycle preflight.
 * Prints aggregate counts only — never names, emails, subjects, snippets, or message bodies.
 * Performs no UPDATE/DELETE/INSERT.
 *
 * Usage: npx tsx scripts/preflight-email-contact-lifecycle.ts
 */
import "dotenv/config";
import { contacts, conversations, contactNotes, appointments, campaignEnrollments } from "../shared/schema";
import { aggregateEmailContactLifecyclePreflight } from "../shared/emailContactLifecyclePreflight";

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify({
        event: "email_contact_lifecycle_preflight",
        readOnly: true,
        mutated: false,
        skipped: true,
        reason: "no_database_url",
      }),
    );
    return;
  }

  const { db } = await import("../drizzle/db");
  const [contactRows, conversationRows, noteRows, appointmentRows, enrollmentRows] = await Promise.all([
    db
      .select({
        id: contacts.id,
        userId: contacts.userId,
        source: contacts.source,
        email: contacts.email,
        tag: contacts.tag,
        pipelineStage: contacts.pipelineStage,
        notes: contacts.notes,
        assignedTo: contacts.assignedTo,
        leadScore: contacts.leadScore,
        sourceDetails: contacts.sourceDetails,
      })
      .from(contacts),
    db.select({ contactId: conversations.contactId }).from(conversations),
    db.select({ contactId: contactNotes.contactId }).from(contactNotes),
    db.select({ contactId: appointments.contactId }).from(appointments),
    db.select({ contactId: campaignEnrollments.contactId }).from(campaignEnrollments),
  ]);

  const conversationIds = new Set(conversationRows.map((row) => row.contactId));
  const noteIds = new Set(noteRows.map((row) => row.contactId));
  const appointmentIds = new Set(appointmentRows.map((row) => row.contactId));
  const enrollmentIds = new Set(enrollmentRows.map((row) => row.contactId));

  const aggregates = aggregateEmailContactLifecyclePreflight(
    contactRows.map((row) => ({
      userId: row.userId,
      source: row.source,
      email: row.email,
      tag: row.tag,
      pipelineStage: row.pipelineStage,
      notes: row.notes,
      assignedTo: row.assignedTo,
      leadScore: row.leadScore,
      sourceDetails: row.sourceDetails,
      hasConversation: conversationIds.has(row.id),
      hasContactNotes: noteIds.has(row.id),
      hasAppointment: appointmentIds.has(row.id),
      hasCampaignEnrollment: enrollmentIds.has(row.id),
    })),
  );
  const payload = {
    event: "email_contact_lifecycle_preflight",
    readOnly: true,
    mutated: false,
    ...aggregates,
  };
  const serialized = JSON.stringify(payload, null, 2);
  if (/@/.test(serialized)) {
    throw new Error("preflight_refused_pii");
  }
  console.log(serialized);
}

main().catch((err) => {
  const name = err instanceof Error ? err.name : "error";
  const message = err instanceof Error ? err.message : "";
  const code = err && typeof err === "object" && "code" in err ? String((err as { code?: unknown }).code || "") : "";
  if (message === "preflight_refused_pii") {
    console.error("email_contact_lifecycle_preflight_failed", "pii_guard");
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      event: "email_contact_lifecycle_preflight",
      readOnly: true,
      mutated: false,
      skipped: true,
      reason: "database_unreachable",
      errorName: name,
      errorCode: code || null,
    }),
  );
});
