import { and, asc, desc, eq, ne, or, sql } from "drizzle-orm";
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
import { isAnonymousWebchatVisitorName } from "@shared/agent/webchatLeadContext";
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
  // Compare stored formats with the inquiry form's canonical digits.
  const storedPhone = (field: ReturnType<typeof sql>) =>
    sql`regexp_replace(regexp_replace(regexp_replace(${field}, '[^0-9]', '', 'g'), '^00([1-9])', '\\1'), '^1([0-9]{10})$', '\\1')`;
  const legacyMessage = sql`${messages.externalMessageId} ~ '^agent_page_[0-9]{13}_[a-z0-9]{1,12}$'`;
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
    const legacyEvidence = sql`exists (select 1 from ${messages} where ${messages.userId} = ${contacts.userId}
      and ${messages.contactId} = ${contacts.id} and ${messages.direction} = 'inbound' and ${legacyMessage})`;
    const legacyEmail = and(legacy, sql`nullif(trim(${contacts.email}), '') is null`,
      or(sql`${contacts.webchatId} = lower(trim(${contacts.customFields}->>'email'))`, legacyEvidence));
    const legacyPhoneMatch = and(legacy, sql`nullif(trim(${contacts.phone}), '') is null`,
      sql`${contacts.sourceDetails}->>'agentPagePhoneManuallyEdited' is distinct from 'true'`,
      or(sql`${contacts.webchatId} = regexp_replace(${contacts.customFields}->>'phone', '[^0-9]', '', 'g')`, legacyEvidence));
    const phoneMatches = (value: string) => or(
      sql`${storedPhone(sql`${contacts.phone}`)} = ${value}`,
      sql`${storedPhone(sql`${contacts.whatsappId}`)} = ${value}`,
      and(legacyPhoneMatch, sql`${storedPhone(sql`${contacts.customFields}->>'phone'`)} = ${value}`),
    );
    const matches = await tx.select().from(contacts).where(and(eq(contacts.userId, userId), or(
      email ? sql`lower(trim(${contacts.email})) = ${email}` : undefined,
      email ? and(legacyEmail, sql`lower(trim(${contacts.customFields}->>'email')) = ${email}`) : undefined,
      phone ? phoneMatches(phone) : undefined,
    ))).orderBy(asc(contacts.id)).limit(2).for("update");
    // Never attach an inquiry or a new identity field when the matches disagree.
    if (matches.length > 1) return null;
    const [existing] = matches;
    const fields = (existing?.customFields ?? {}) as Record<string, unknown>;
    const details = (existing?.sourceDetails ?? {}) as Record<string, unknown>;
    const wasLegacyForm = existing?.source === "webchat" &&
      (fields.sourcePage === "agent_page" || fields.sourcePage === "agent_page_embed" || details.agentPageForm === true) &&
      !!existing.webchatId && (existing.webchatId === String(fields.email ?? "").trim().toLowerCase() ||
        existing.webchatId === String(fields.phone ?? "").replace(/\D/g, ""));
    const [originalFormMessage] = wasLegacyForm ? await tx.select({ id: messages.id }).from(messages).where(and(
      eq(messages.userId, userId), eq(messages.contactId, existing.id), eq(messages.direction, "inbound"), legacyMessage,
    )).limit(1) : [];
    const oldEmail = typeof fields.email === "string" ? collectValidatedIdentity({ email: fields.email }).email : undefined;
    const oldPhone = validatedAgentInquiryPhone(fields.phone);
    const knownLegacyEmail = wasLegacyForm && (originalFormMessage || existing.webchatId === oldEmail) ? oldEmail : undefined;
    const knownLegacyPhone = wasLegacyForm && details.agentPagePhoneManuallyEdited !== true &&
      (originalFormMessage || existing.webchatId === String(fields.phone ?? "").replace(/\D/g, "")) ? oldPhone : undefined;
    const storedEmail = existing?.email?.trim().toLowerCase();
    const canonicalPhone = existing?.phone?.trim();
    const providerPhone = validatedAgentInquiryPhone(existing?.whatsappId);
    const knownEmail = storedEmail || knownLegacyEmail;
    const knownPhone = canonicalPhone ? validatedAgentInquiryPhone(canonicalPhone) : providerPhone ?? knownLegacyPhone;
    const matchesKnownIdentity = (email && email === knownEmail) || (phone && phone === knownPhone);
    const conflictingEmail = email && knownEmail && email !== knownEmail;
    const conflictingPhone = phone && (canonicalPhone || knownPhone) && phone !== knownPhone;
    const manuallyClearedPhone = phone && !canonicalPhone && details.agentPagePhoneManuallyEdited === true;
    if (existing && (!matchesKnownIdentity || conflictingEmail || conflictingPhone || manuallyClearedPhone)) return null;

    const isNewLead = !existing || !isCrmListedContact(existing);
    const currentName = existing?.name?.trim();
    // Correct an old inferred name when it matches a previous inquiry from the legacy form.
    const [legacyNameMessage] = name && currentName && originalFormMessage && details.agentPageFormNameCaptured !== true &&
      details.agentPageNameManuallyEdited !== true
      ? await tx.select({ id: messages.id }).from(messages).where(and(
          eq(messages.userId, userId), eq(messages.contactId, existing.id), eq(messages.direction, "inbound"),
          legacyMessage, sql`trim(${messages.content}) = ${currentName}`,
        )).limit(1)
      : [];
    const captureFormName = !!name && details.agentPageNameManuallyEdited !== true &&
      (!currentName || isAnonymousWebchatVisitorName(currentName) || !!legacyNameMessage);
    let recoveredPhone: string | undefined;
    const legacyPhone = originalFormMessage && !phone && !canonicalPhone && (!providerPhone || providerPhone === knownLegacyPhone)
      ? knownLegacyPhone : undefined;
    if (legacyPhone) {
      const lockKey = `agent-page:${userId}:phone:${legacyPhone}`;
      // The contact row is already locked. Skip this fallback if a phone submission holds the identity lock.
      const lock = await tx.execute<{ acquired: boolean }>(sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`);
      if (lock.rows[0]?.acquired) {
        const [other] = await tx.select({ id: contacts.id }).from(contacts).where(and(
          eq(contacts.userId, userId), ne(contacts.id, existing.id), phoneMatches(legacyPhone),
        )).limit(1);
        if (!other) recoveredPhone = legacyPhone;
      }
    }
    const patch = {
      name: (captureFormName ? name : existing?.name) || "Agent Page Visitor",
      email: storedEmail ? existing?.email : email,
      ...(canonicalPhone || details.agentPagePhoneManuallyEdited === true ? {} : { phone: phone ?? recoveredPhone }),
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
