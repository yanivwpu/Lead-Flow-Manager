/**
 * Batch-load website-form display identity for Unified Inbox email rows.
 * Uses persisted source_metadata/source_type only (no full-body reclassification on list load).
 */

import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { emailMessageDetails, messages } from "@shared/schema";
import {
  resolveWebsiteFormDisplayIdentity,
  toInboxWebsiteFormIdentity,
  type InboxWebsiteFormIdentity,
} from "@shared/websiteFormIdentity";
import { isWebsiteFormSourceMetadata } from "@shared/websiteFormEmail";

export async function loadInboxFormIdentitiesByConversationIds(
  conversationIds: string[],
): Promise<Map<string, InboxWebsiteFormIdentity>> {
  const out = new Map<string, InboxWebsiteFormIdentity>();
  const ids = [...new Set(conversationIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const rows = await db
    .select({
      conversationId: messages.conversationId,
      sourceType: emailMessageDetails.sourceType,
      sourceMetadata: emailMessageDetails.sourceMetadata,
      replyToAddress: emailMessageDetails.replyToAddress,
      replyToName: emailMessageDetails.replyToName,
      fromAddress: emailMessageDetails.fromAddress,
      subject: emailMessageDetails.subject,
      sentAt: messages.sentAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(emailMessageDetails, eq(emailMessageDetails.messageId, messages.id))
    .where(
      and(
        inArray(messages.conversationId, ids),
        eq(messages.direction, "inbound"),
        or(
          eq(emailMessageDetails.sourceType, "website_form"),
          isNotNull(emailMessageDetails.sourceType),
        ),
      ),
    )
    .orderBy(desc(messages.sentAt), desc(messages.createdAt));

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.conversationId || seen.has(row.conversationId)) continue;
    seen.add(row.conversationId);

    const formMeta = isWebsiteFormSourceMetadata(row.sourceMetadata)
      ? row.sourceMetadata
      : null;
    if (!formMeta && row.sourceType !== "website_form") continue;

    const identity = resolveWebsiteFormDisplayIdentity({
      formMeta,
      sourceType: row.sourceType || formMeta?.sourceType,
      replyToEmail: row.replyToAddress || formMeta?.replyTargetEmail,
      replyToName: row.replyToName || formMeta?.replyTargetName,
      fromEmail: row.fromAddress || formMeta?.notificationFromEmail,
      fromName: formMeta?.notificationFromName,
      emailSubject: row.subject,
    });
    const compact = toInboxWebsiteFormIdentity(identity);
    if (compact) out.set(row.conversationId, compact);
  }

  return out;
}
