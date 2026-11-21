import { and, desc, eq, or, sql } from "drizzle-orm";
import { EMAIL_INBOX_IDENTITY_SOURCE, isCrmListedContact } from "@shared/contactCrmVisibility";
import { contacts, conversations } from "@shared/schema";
import {
  collectValidatedIdentity,
  promotedWebchatSourceDetails,
  stampPromotedWebchatIdentity,
  type ValidatedWebchatIdentity,
} from "@shared/webchatIdentityPromotion";
import type { WebchatPageContext } from "@shared/webchatPageContext";
import { AGENT_PAGE_FORM_ACCOUNT } from "@shared/agent/agentPageSchema";
import { db } from "../../drizzle/db";

/** Resolve identity and reserve the private Inbox thread together, before processing the message. */
export async function resolveAgentPageFormContact(input: {
  userId: string;
  identity: ValidatedWebchatIdentity;
  sourcePage: "agent_page" | "agent_page_embed";
  attribution: Record<string, unknown>;
  pageContext?: WebchatPageContext;
}) {
  const { userId, identity, sourcePage, attribution, pageContext } = input;
  const { name, email, phone } = identity;
  // Mirror the existing webchat normalization for stored formatted/US +1 numbers.
  const storedPhone = (field: ReturnType<typeof sql>) =>
    sql`regexp_replace(regexp_replace(${field}, '[^0-9]', '', 'g'), '^1([0-9]{10})$', '\\1')`;
  return db.transaction(async (tx) => {
    // A submission with both fields must serialize with submissions using either field alone.
    for (const key of [email && `email:${email}`, phone && `phone:${phone}`].filter(Boolean).sort()) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-page:${userId}:${key}`}, 0))`);
    }
    const legacy = sql`${contacts.source} = 'webchat'
      and ${contacts.customFields}->>'sourcePage' in ('agent_page', 'agent_page_embed')
      and (${contacts.webchatId} = lower(trim(${contacts.customFields}->>'email'))
        or ${contacts.webchatId} = regexp_replace(${contacts.customFields}->>'phone', '[^0-9]', '', 'g'))`;
    const matches = await tx.select().from(contacts).where(and(eq(contacts.userId, userId), or(
      email ? sql`lower(trim(${contacts.email})) = ${email}` : undefined,
      phone ? sql`${storedPhone(sql`${contacts.phone}`)} = ${phone}` : undefined,
      phone ? sql`${storedPhone(sql`${contacts.whatsappId}`)} = ${phone}` : undefined,
      and(legacy, or(
        email ? sql`lower(trim(${contacts.customFields}->>'email')) = ${email}` : undefined,
        phone ? sql`${storedPhone(sql`${contacts.customFields}->>'phone'`)} = ${phone}` : undefined,
      )),
    ))).limit(2).for("update");
    // Never attach an inquiry or a new identity field when the matches disagree.
    if (matches.length > 1) return null;
    const [existing] = matches;
    const current = existing ? collectValidatedIdentity(existing) : {};
    const fields = (existing?.customFields ?? {}) as Record<string, unknown>;
    const details = (existing?.sourceDetails ?? {}) as Record<string, unknown>;
    const wasLegacyForm = existing?.source === "webchat" &&
      (fields.sourcePage === "agent_page" || fields.sourcePage === "agent_page_embed") &&
      !!existing.webchatId && (existing.webchatId === String(fields.email ?? "").trim().toLowerCase() ||
        existing.webchatId === String(fields.phone ?? "").replace(/\D/g, ""));
    const isNewLead = !existing || !isCrmListedContact(existing);
    // The original form used chat extraction, so even a plausible legacy name may be a message.
    const captureFormName = !!name && (!current.name || (wasLegacyForm && details.agentPageFormNameCaptured !== true));
    const patch = {
      name: (captureFormName ? name : current.name) || existing?.name || "Agent Page Visitor",
      email: current.email ? existing!.email : email,
      phone: current.phone ? existing!.phone : phone,
      source: !existing?.source || existing.source === EMAIL_INBOX_IDENTITY_SOURCE ? "webchat" : existing.source,
      sourceDetails: promotedWebchatSourceDetails(details, {
        agentPageForm: true,
        ...(captureFormName ? { agentPageFormNameCaptured: true } : {}),
        identifiedFrom: "agent_page_form",
        leadSource: attribution.leadSource,
      }),
      customFields: stampPromotedWebchatIdentity({ ...fields, sourcePage, ...attribution }, { identifiedFrom: "agent_page_form" }),
      ...(pageContext ? { webchatContext: { ...(existing?.webchatContext as object), ...pageContext } } : {}),
      // Preserve a contact's existing pipeline position.
      ...(isNewLead && (!existing || existing.pipelineStage === "Lead") ? { pipelineStage: "New Lead" } : {}),
      lastIncomingChannel: "webchat",
      lastIncomingAt: new Date(),
      updatedAt: new Date(),
    };
    const [contact] = existing
      ? await tx.update(contacts).set(patch).where(and(eq(contacts.id, existing.id), eq(contacts.userId, userId))).returning()
      : await tx.insert(contacts).values({ ...patch, userId, primaryChannel: "webchat" }).returning();

    const threadScope = and(eq(conversations.userId, userId), eq(conversations.contactId, contact.id), eq(conversations.channel, "webchat"));
    let [conversation] = await tx.select().from(conversations)
      .where(and(threadScope, eq(conversations.channelAccountId, AGENT_PAGE_FORM_ACCOUNT))).limit(1);
    if (!conversation && wasLegacyForm) {
      [conversation] = await tx.select().from(conversations).where(threadScope)
        .orderBy(desc(conversations.lastMessageAt)).limit(1);
      if (conversation) {
        [conversation] = await tx.update(conversations).set({ channelAccountId: AGENT_PAGE_FORM_ACCOUNT })
          .where(and(threadScope, eq(conversations.id, conversation.id))).returning();
      }
    }
    const conversationCreated = !conversation;
    if (!conversation) {
      [conversation] = await tx.insert(conversations).values({
        userId, contactId: contact.id, channel: "webchat", channelAccountId: AGENT_PAGE_FORM_ACCOUNT,
      }).returning();
    }
    return { contact, conversation, contactCreated: !existing, conversationCreated };
  });
}
