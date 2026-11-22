import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { EMAIL_INBOX_IDENTITY_SOURCE, isCrmListedContact } from "@shared/contactCrmVisibility";
import { contacts, conversations, messages } from "@shared/schema";
import {
  collectValidatedIdentity,
  promotedWebchatSourceDetails,
  stampPromotedWebchatIdentity,
  type ValidatedWebchatIdentity,
} from "@shared/webchatIdentityPromotion";
import type { WebchatPageContext } from "@shared/webchatPageContext";
import { AGENT_PAGE_FORM_ACCOUNT } from "@shared/agent/agentPageSchema";
import { validatedAgentInquiryPhone } from "@shared/agent/agentPageInquiry";
import { db } from "../../drizzle/db";

/** Resolve identity and reserve the private Inbox thread together, before processing the message. */
export async function resolveAgentPageFormContact(input: {
  userId: string;
  identity: ValidatedWebchatIdentity;
  sourcePage: "agent_page" | "agent_page_embed" | "listing_flyer";
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
      and (${contacts.customFields}->>'sourcePage' in ('agent_page', 'agent_page_embed')
        or ${contacts.sourceDetails}->>'agentPageForm' = 'true')
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
      (fields.sourcePage === "agent_page" || fields.sourcePage === "agent_page_embed" || details.agentPageForm === true) &&
      !!existing.webchatId && (existing.webchatId === String(fields.email ?? "").trim().toLowerCase() ||
        existing.webchatId === String(fields.phone ?? "").replace(/\D/g, ""));
    const isNewLead = !existing || !isCrmListedContact(existing);
    // Correct an old inferred name when it matches a previous inquiry from the legacy form.
    const [legacyNameMessage] = name && current.name && wasLegacyForm && details.agentPageFormNameCaptured !== true
      ? await tx.select({ id: messages.id }).from(messages).where(and(
          eq(messages.userId, userId), eq(messages.contactId, existing.id), eq(messages.direction, "inbound"),
          sql`starts_with(${messages.externalMessageId}, 'agent_page_')`,
          sql`trim(${messages.content}) = ${current.name}`,
        )).limit(1)
      : [];
    const captureFormName = !!name && (!current.name || !!legacyNameMessage);
    let recoveredPhone: string | undefined;
    const legacyPhone = wasLegacyForm && !phone && !existing.phone?.trim() && details.agentPagePhoneManuallyEdited !== true
      ? validatedAgentInquiryPhone(fields.phone) : undefined;
    if (legacyPhone) {
      // Only the old form stored a phone in custom fields with this delivery ID format.
      const [legacyMessage] = await tx.select({ id: messages.id }).from(messages).where(and(
        eq(messages.userId, userId), eq(messages.contactId, existing.id), eq(messages.direction, "inbound"),
        sql`${messages.externalMessageId} ~ '^agent_page_[0-9]{13}_[a-z0-9]{1,12}$'`,
      )).limit(1);
      if (legacyMessage) {
        const lockKey = `agent-page:${userId}:phone:${legacyPhone}`;
        // The contact row is already locked. Skip this fallback if a phone submission holds the identity lock.
        const lock = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`);
        if (lock.rows[0]?.acquired) {
          const [other] = await tx.select({ id: contacts.id }).from(contacts).where(and(
            eq(contacts.userId, userId), ne(contacts.id, existing.id), or(
              sql`${storedPhone(sql`${contacts.phone}`)} = ${legacyPhone}`,
              sql`${storedPhone(sql`${contacts.whatsappId}`)} = ${legacyPhone}`,
              and(legacy, sql`${storedPhone(sql`${contacts.customFields}->>'phone'`)} = ${legacyPhone}`),
            ),
          )).limit(1);
          if (!other) recoveredPhone = legacyPhone;
        }
      }
    }
    const patch = {
      name: (captureFormName ? name : current.name) || existing?.name || "Agent Page Visitor",
      email: current.email ? existing!.email : email,
      ...(existing?.phone?.trim() || details.agentPagePhoneManuallyEdited === true ? {} : { phone: phone ?? recoveredPhone }),
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
