/**
 * Tenant-scoped delete for Unknown/anonymous Inbox conversations.
 * Does not delete identified CRM contacts or sibling conversations.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import {
  automationTimerJobs,
  contacts,
  conversations,
  flowJobs,
  noReplyJobs,
} from "@shared/schema";
import { isCrmListedContact } from "@shared/contactCrmVisibility";
import { clearChatbotPendingAsk } from "@shared/chatbotAskQuestion";
import { db } from "../drizzle/db";
import { deleteContactRecords } from "./contactDeleteService";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DeleteAnonymousInboxConversationResult =
  | { ok: true; alreadyDeleted: true }
  | {
      ok: true;
      alreadyDeleted: false;
      conversationId: string;
      contactId: string;
      contactDeleted: boolean;
    }
  | { ok: false; code: "forbidden" | "identified_contact" };

async function invalidateConversationOwnedWork(tx: DbTx, conversationId: string, contactId: string): Promise<void> {
  await tx
    .update(flowJobs)
    .set({ status: "skipped", lockedAt: null, errorMessage: "conversation_deleted" })
    .where(and(eq(flowJobs.conversationId, conversationId), inArray(flowJobs.status, ["pending", "running"])));
  await tx
    .update(noReplyJobs)
    .set({ status: "cancelled", lockedAt: null, lastError: "conversation_deleted", updatedAt: new Date() })
    .where(
      and(eq(noReplyJobs.conversationId, conversationId), inArray(noReplyJobs.status, ["pending", "running"])),
    );
  await tx
    .update(automationTimerJobs)
    .set({ status: "cancelled", lastError: "conversation_deleted" })
    .where(
      and(
        inArray(automationTimerJobs.status, ["pending", "running"]),
        sql`(
          ${automationTimerJobs.payload}->>'conversationId' = ${conversationId}
          OR ${automationTimerJobs.payload}->>'contactId' = ${contactId}
        )`,
      ),
    );
}

export async function deleteAnonymousInboxConversationSafely(
  workspaceUserId: string,
  conversationId: string,
): Promise<DeleteAnonymousInboxConversationResult> {
  const id = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!id) return { ok: true, alreadyDeleted: true };

  try {
    const { abortWebchatGeneration } = await import("./webchatGenerationAbort");
    abortWebchatGeneration(id);
  } catch {
    // Generation abort is best-effort; DB cleanup still proceeds.
  }
  clearChatbotPendingAsk(id);

  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    if (!conversation) return { ok: true as const, alreadyDeleted: true as const };
    if (conversation.userId !== workspaceUserId) return { ok: false as const, code: "forbidden" as const };

    const [contact] = await tx
      .select()
      .from(contacts)
      .where(eq(contacts.id, conversation.contactId));
    if (!contact || contact.userId !== workspaceUserId) {
      return { ok: false as const, code: "forbidden" as const };
    }
    if (isCrmListedContact(contact)) {
      return { ok: false as const, code: "identified_contact" as const };
    }

    const siblingRows = await tx
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.contactId, contact.id), eq(conversations.userId, workspaceUserId)));
    const deletePlaceholderContact = siblingRows.length === 1 && siblingRows[0].id === conversation.id;

    await invalidateConversationOwnedWork(tx, conversation.id, contact.id);
    await tx
      .delete(conversations)
      .where(and(eq(conversations.id, conversation.id), eq(conversations.userId, workspaceUserId)));

    if (deletePlaceholderContact) {
      await deleteContactRecords([contact.id], tx);
    }

    return {
      ok: true as const,
      alreadyDeleted: false as const,
      conversationId: conversation.id,
      contactId: contact.id,
      contactDeleted: deletePlaceholderContact,
    };
  });
}
