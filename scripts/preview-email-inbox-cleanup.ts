/**
 * PREVIEW ONLY — historical Email-created Contact cleanup classifier.
 *
 * Read-only. Does not update source, hide, delete, or mutate any row.
 *
 * Run: npx tsx scripts/preview-email-inbox-cleanup.ts
 */
import "dotenv/config";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  activityEvents,
  appointments,
  campaignEnrollments,
  contactNotes,
  contacts,
  conversations,
  emailMessageDetails,
  messages,
} from "../shared/schema";
import {
  classifyHistoricalEmailContact,
  maskEmailForCleanupPreview,
  type HistoricalEmailCleanupBucket,
  type HistoricalEmailCleanupContact,
  type HistoricalInboundEmail,
} from "../shared/emailInboxHistoricalCleanup";

const SAMPLE_SIZE = 15;
const INBOUND_WINDOW = 5;
const WRITE_FLAGS = ["--apply", "--write", "--delete", "--convert", "--fix", "--mutate"];

function refuseWriteFlags(): void {
  const argv = process.argv.slice(2).map((a) => a.toLowerCase());
  const hit = WRITE_FLAGS.find((f) => argv.includes(f));
  if (hit) {
    throw new Error(`Refusing ${hit}: this script is preview-only and cannot mutate data.`);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type PreviewRow = {
  contactId: string;
  displayName: string;
  maskedEmail: string | null;
  latestSubject: string | null;
  classifierReason: string;
  inboundMessageCount: number;
  outboundCount: number;
  otherChannelCount: number;
  bucket: HistoricalEmailCleanupBucket;
};

async function main() {
  refuseWriteFlags();

  const report = await db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION READ ONLY`);

    const candidateRows = await tx
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        source: contacts.source,
        sourceDetails: contacts.sourceDetails,
        customFields: contacts.customFields,
        tag: contacts.tag,
        pipelineStage: contacts.pipelineStage,
        notes: contacts.notes,
        followUp: contacts.followUp,
        followUpDate: contacts.followUpDate,
        assignedTo: contacts.assignedTo,
        phone: contacts.phone,
        whatsappId: contacts.whatsappId,
        instagramId: contacts.instagramId,
        facebookId: contacts.facebookId,
        telegramId: contacts.telegramId,
        ghlId: contacts.ghlId,
      })
      .from(contacts)
      .where(
        and(
          eq(contacts.source, "email"),
          sql`NOT EXISTS (SELECT 1 FROM messages m WHERE m.contact_id = contacts.id AND m.direction = 'outbound')`,
          sql`NOT EXISTS (
            SELECT 1 FROM conversations v
            WHERE v.contact_id = contacts.id
              AND lower(v.channel) <> 'email'
          )`,
          sql`EXISTS (
            SELECT 1 FROM conversations v
            WHERE v.contact_id = contacts.id
              AND lower(v.channel) = 'email'
          )`,
        ),
      );

    const ids = candidateRows.map((c) => c.id);
    const appointmentSet = new Set<string>();
    const notesSet = new Set<string>();
    const activitySet = new Set<string>();
    const enrollmentSet = new Set<string>();
    const inboundCount = new Map<string, number>();
    const outboundCount = new Map<string, number>();
    const otherChannelCount = new Map<string, number>();
    const inboundsByContact = new Map<string, HistoricalInboundEmail[]>();
    const latestSubjectByContact = new Map<string, string | null>();

    for (const part of chunk(ids, 200)) {
      if (part.length === 0) continue;

      const appts = await tx
        .select({ contactId: appointments.contactId })
        .from(appointments)
        .where(inArray(appointments.contactId, part));
      for (const a of appts) appointmentSet.add(a.contactId);

      const notes = await tx
        .select({ contactId: contactNotes.contactId })
        .from(contactNotes)
        .where(inArray(contactNotes.contactId, part));
      for (const n of notes) notesSet.add(n.contactId);

      const acts = await tx
        .select({
          contactId: activityEvents.contactId,
          eventType: activityEvents.eventType,
          actorType: activityEvents.actorType,
        })
        .from(activityEvents)
        .where(inArray(activityEvents.contactId, part));
      for (const a of acts) {
        const keepType =
          a.eventType === "note" ||
          a.eventType === "tag_change" ||
          a.eventType === "stage_change" ||
          a.eventType === "assignment" ||
          a.eventType === "appointment_created" ||
          a.eventType === "appointment_updated" ||
          a.eventType === "campaign_enrolled" ||
          a.actorType === "user";
        if (keepType) activitySet.add(a.contactId);
      }

      const enrolls = await tx
        .select({ contactId: campaignEnrollments.contactId })
        .from(campaignEnrollments)
        .where(inArray(campaignEnrollments.contactId, part));
      for (const e of enrolls) enrollmentSet.add(e.contactId);

      const msgCounts = await tx
        .select({
          contactId: messages.contactId,
          direction: messages.direction,
          n: sql<number>`count(*)::int`,
        })
        .from(messages)
        .where(inArray(messages.contactId, part))
        .groupBy(messages.contactId, messages.direction);
      for (const row of msgCounts) {
        if (row.direction === "outbound") outboundCount.set(row.contactId, Number(row.n));
        if (row.direction === "inbound") inboundCount.set(row.contactId, Number(row.n));
      }

      const otherCh = await tx
        .select({
          contactId: conversations.contactId,
          n: sql<number>`count(*)::int`,
        })
        .from(conversations)
        .where(and(inArray(conversations.contactId, part), ne(conversations.channel, "email")))
        .groupBy(conversations.contactId);
      for (const row of otherCh) otherChannelCount.set(row.contactId, Number(row.n));

      const inboundRows = await tx
        .select({
          contactId: messages.contactId,
          content: messages.content,
          createdAt: messages.createdAt,
          subject: emailMessageDetails.subject,
          textBody: emailMessageDetails.textBody,
          fromAddress: emailMessageDetails.fromAddress,
          snippet: emailMessageDetails.snippet,
          sourceType: emailMessageDetails.sourceType,
        })
        .from(messages)
        .leftJoin(emailMessageDetails, eq(emailMessageDetails.messageId, messages.id))
        .where(and(inArray(messages.contactId, part), eq(messages.direction, "inbound")))
        .orderBy(desc(messages.createdAt));

      for (const row of inboundRows) {
        const list = inboundsByContact.get(row.contactId) || [];
        if (list.length >= INBOUND_WINDOW) continue;
        const body = String(row.textBody || row.content || row.snippet || "").trim();
        list.push({
          fromEmail: row.fromAddress,
          subject: row.subject,
          body,
          sourceType: row.sourceType,
        });
        inboundsByContact.set(row.contactId, list);
        if (!latestSubjectByContact.has(row.contactId)) {
          latestSubjectByContact.set(row.contactId, row.subject || null);
        }
      }
    }

    const buckets: Record<HistoricalEmailCleanupBucket, PreviewRow[]> = {
      HIGH_CONFIDENCE_SYSTEM: [],
      HUMAN_OR_LEAD: [],
      UNCERTAIN: [],
    };

    for (const c of candidateRows) {
      const input: HistoricalEmailCleanupContact = {
        source: c.source,
        sourceDetails: c.sourceDetails,
        customFields: c.customFields,
        tag: c.tag,
        pipelineStage: c.pipelineStage,
        notes: c.notes,
        followUp: c.followUp,
        followUpDate: c.followUpDate,
        assignedTo: c.assignedTo,
        phone: c.phone,
        whatsappId: c.whatsappId,
        instagramId: c.instagramId,
        facebookId: c.facebookId,
        telegramId: c.telegramId,
        ghlId: c.ghlId,
        inboundCount: inboundCount.get(c.id) || 0,
        outboundCount: outboundCount.get(c.id) || 0,
        otherChannelCount: otherChannelCount.get(c.id) || 0,
        hasAppointment: appointmentSet.has(c.id),
        hasCrmNotes: notesSet.has(c.id),
        hasUserCrmActivity: activitySet.has(c.id),
        hasCampaignEnrollment: enrollmentSet.has(c.id),
        latestInbounds: inboundsByContact.get(c.id) || [],
      };
      const result = classifyHistoricalEmailContact(input);
      const row: PreviewRow = {
        contactId: c.id,
        displayName: c.name,
        maskedEmail: maskEmailForCleanupPreview(c.email),
        latestSubject: latestSubjectByContact.get(c.id) || null,
        classifierReason: result.reason,
        inboundMessageCount: input.inboundCount,
        outboundCount: input.outboundCount,
        otherChannelCount: input.otherChannelCount,
        bucket: result.bucket,
      };
      buckets[result.bucket].push(row);
    }

    const sample = (rows: PreviewRow[]) =>
      rows.slice(0, SAMPLE_SIZE).map((r) => ({
        contactId: r.contactId,
        displayName: r.displayName,
        maskedEmail: r.maskedEmail,
        latestSubject: r.latestSubject,
        classifierReason: r.classifierReason,
        inboundMessageCount: r.inboundMessageCount,
        outboundCount: r.outboundCount,
        otherChannelCount: r.otherChannelCount,
      }));

    const reasonCounts = (rows: PreviewRow[]) => {
      const map: Record<string, number> = {};
      for (const r of rows) map[r.classifierReason] = (map[r.classifierReason] || 0) + 1;
      return map;
    };

    const report = {
      readOnly: true,
      mutated: false,
      candidatesScanned: candidateRows.length,
      HIGH_CONFIDENCE_SYSTEM: buckets.HIGH_CONFIDENCE_SYSTEM.length,
      HUMAN_OR_LEAD: buckets.HUMAN_OR_LEAD.length,
      UNCERTAIN: buckets.UNCERTAIN.length,
      reasonCounts: {
        HIGH_CONFIDENCE_SYSTEM: reasonCounts(buckets.HIGH_CONFIDENCE_SYSTEM),
        HUMAN_OR_LEAD: reasonCounts(buckets.HUMAN_OR_LEAD),
        UNCERTAIN: reasonCounts(buckets.UNCERTAIN),
      },
      highConfidenceSystemRows: buckets.HIGH_CONFIDENCE_SYSTEM.map((r) => ({
        contactId: r.contactId,
        displayName: r.displayName,
        maskedEmail: r.maskedEmail,
        latestSubject: r.latestSubject,
        classifierReason: r.classifierReason,
        inboundMessageCount: r.inboundMessageCount,
        outboundCount: r.outboundCount,
        otherChannelCount: r.otherChannelCount,
      })),
      samples: {
        HIGH_CONFIDENCE_SYSTEM: sample(buckets.HIGH_CONFIDENCE_SYSTEM),
        HUMAN_OR_LEAD: sample(buckets.HUMAN_OR_LEAD),
        UNCERTAIN: sample(buckets.UNCERTAIN),
      },
    };

    return report;
  });

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
