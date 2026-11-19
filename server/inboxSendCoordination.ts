import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  conversations,
  contacts,
  inboxSendAttempts,
  messages,
} from "@shared/schema";
import {
  pauseAiControl,
  readConversationAiControl,
  generationLeaseAllowsCommit,
} from "@shared/webchatAiPolicy";
import { getInboxWorkspaceAccess } from "./inboxWorkspaceAccess";
import {
  inboxScope,
  inboxSendRuntime,
  assertInboxFence,
  InboxCoordinationError,
} from "./inboxDispatchFence";
import { abortWebchatGeneration } from "./webchatGenerationAbort";
import { notifyUser } from "./presence";
export { InboxCoordinationError };
export interface SendTarget {
  workspaceId: string;
  contactId: string;
  channel: string;
  conversationId?: string | null;
}
interface Context extends SendTarget {
  attemptId: string;
  actorId?: string;
  dispatched: boolean;
  ai: boolean;
  leaseId?: string;
  aiEpoch?: number;
}
const sending = new AsyncLocalStorage<Context>();
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
export function sendFingerprint(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(payload)))
    .digest("hex");
}
export async function replyState(
  target: SendTarget,
  scope = inboxScope(target),
) {
  const [attempt] = await db
    .select()
    .from(inboxSendAttempts)
    .where(
      and(
        eq(inboxSendAttempts.workspaceId, target.workspaceId),
        eq(inboxSendAttempts.scope, scope),
        ne(inboxSendAttempts.state, "failed"),
      ),
    )
    .orderBy(desc(inboxSendAttempts.sequence))
    .limit(1);
  const [last] = await db
    .select({ id: messages.id, createdAt: messages.createdAt, generatedBy: messages.generatedBy })
    .from(messages)
    .where(
      and(
        eq(messages.userId, target.workspaceId),
        eq(messages.contactId, target.contactId),
        eq(messages.direction, "outbound"),
        sql`${messages.status} IS DISTINCT FROM 'failed'`,
        target.channel === "email"
          ? target.conversationId
            ? eq(messages.conversationId, target.conversationId)
            : sql`false`
          : sql`${messages.conversationId} IN (SELECT id FROM conversations WHERE user_id=${target.workspaceId} AND contact_id=${target.contactId} AND channel=${target.channel})`,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);
  return {
    revision: `${attempt?.sequence || 0}/${last?.id || "-"}`,
    uncertain: attempt?.state === "unknown",
    latestMessageId: last?.id || null,
    latestReply: last || null,
  };
}
async function currentConversation(target: SendTarget) {
  if (!target.conversationId) return null;
  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, target.conversationId),
        eq(conversations.userId, target.workspaceId),
        eq(conversations.contactId, target.contactId),
        eq(conversations.channel, target.channel),
      ),
    );
  if (!conv) throw new InboxCoordinationError("conversation_unavailable", 404);
  return conv;
}
async function aiAllowed(ctx: Context) {
  const conv = await currentConversation(ctx);
  if (!conv) return;
  const control = readConversationAiControl(conv.aiControl);
  if (
    control.paused ||
    (ctx.leaseId
      ? !generationLeaseAllowsCommit(control, ctx.leaseId)
      : ctx.aiEpoch !== undefined && control.generationEpoch !== ctx.aiEpoch)
  )
    throw new InboxCoordinationError("ai_superseded");
  const [contact] = await db
    .select({ paused: contacts.automationsPaused })
    .from(contacts)
    .where(eq(contacts.id, ctx.contactId));
  if (contact?.paused) throw new InboxCoordinationError("automations_paused");
}
export async function beforeInboxProviderDispatch() {
  const ctx = sending.getStore();
  if (!ctx) return;
  assertInboxFence();
  if (ctx.dispatched) throw new InboxCoordinationError("delivery_unknown"); // No blind delivery fallback after a possibly accepted attempt.
  if (
    ctx.actorId &&
    !(await getInboxWorkspaceAccess(ctx.actorId, ctx.workspaceId))
  )
    throw new InboxCoordinationError("workspace_access_revoked", 403);
  if (ctx.ai) await aiAllowed(ctx);
  await db
    .update(inboxSendAttempts)
    .set({ state: "dispatching", updatedAt: new Date() })
    .where(eq(inboxSendAttempts.id, ctx.attemptId));
  ctx.dispatched = true;
}
export async function coordinatedSend<
  T extends { success?: boolean; conversationId?: string; messageId?: string },
>(
  input: SendTarget & {
    actorId?: string;
    attemptId?: string;
    revision?: string;
    payload: unknown;
    ai?: boolean;
    leaseId?: string;
    aiEpoch?: number;
    reviewedRevision?: string;
  },
  work: () => Promise<T>,
): Promise<T> {
  if (sending.getStore()) return work();
  const attemptId = input.attemptId || `auto:${input.leaseId || randomUUID()}`;
  const scope = inboxScope({ ...input, attemptId });
  const fingerprint = sendFingerprint(input.payload);
  const ctx: Context = {
    ...input,
    attemptId,
    ai: !!input.ai,
    dispatched: false,
  };
  const previous = async () => {
    const [row] = await db
      .select()
      .from(inboxSendAttempts)
      .where(eq(inboxSendAttempts.id, attemptId));
    if (!row) return null;
    if (
      row.workspaceId !== input.workspaceId ||
      row.actorId !== (input.actorId || null) ||
      row.fingerprint !== fingerprint ||
      row.contactId !== input.contactId ||
      row.scope !== scope
    )
      throw new InboxCoordinationError("idempotency_mismatch");
    if (row.state === "sent" || row.state === "failed") return row.result as T;
    if (
      Date.now() - row.updatedAt.getTime() > 60000 &&
      row.state !== "unknown"
    ) {
      await db
        .update(inboxSendAttempts)
        .set({ state: "unknown", updatedAt: new Date() })
        .where(eq(inboxSendAttempts.id, row.id));
      throw new InboxCoordinationError("delivery_unknown", 409, { attemptId });
    }
    throw new InboxCoordinationError(
      row.state === "unknown" ? "delivery_unknown" : "send_in_progress",
      row.state === "unknown" ? 409 : 202,
      { attemptId },
    );
  };
  if (
    input.actorId &&
    !(await getInboxWorkspaceAccess(input.actorId, input.workspaceId))
  )
    throw new InboxCoordinationError("workspace_access_revoked", 403);
  const cached = await previous();
  if (cached) return cached;
  return inboxSendRuntime
    .withFence(`${input.workspaceId}:${scope}`, async () => {
      const repeated = await previous();
      if (repeated) return repeated;
      if (
        input.actorId &&
        !(await getInboxWorkspaceAccess(input.actorId, input.workspaceId))
      )
        throw new InboxCoordinationError("workspace_access_revoked", 403);
      await currentConversation(input);
      const [contact] = await db
        .select({ owner: contacts.userId })
        .from(contacts)
        .where(eq(contacts.id, input.contactId));
      if (contact?.owner !== input.workspaceId)
        throw new InboxCoordinationError("conversation_unavailable", 404);
      const state = await replyState(input, scope);
      if (input.revision !== undefined && input.revision !== state.revision)
        throw new InboxCoordinationError(input.revision === "unobserved" ? "reply_state_unavailable" : "reply_conflict", 409, state);
      await db
        .update(inboxSendAttempts)
        .set({ state: "unknown", updatedAt: new Date() })
        .where(
          and(
            eq(inboxSendAttempts.workspaceId, input.workspaceId),
            eq(inboxSendAttempts.scope, scope),
            inArray(inboxSendAttempts.state, ["reserved", "dispatching"]),
            sql`${inboxSendAttempts.updatedAt}<now()-interval '60 seconds'`,
          ),
        );
      const [active] = await db
        .select({ id: inboxSendAttempts.id })
        .from(inboxSendAttempts)
        .where(
          and(
            eq(inboxSendAttempts.workspaceId, input.workspaceId),
            eq(inboxSendAttempts.scope, scope),
            inArray(inboxSendAttempts.state, ["reserved", "dispatching"]),
          ),
        );
      if (active) throw new InboxCoordinationError("send_in_progress");
      const [unknown] = await db
        .select({ id: inboxSendAttempts.id })
        .from(inboxSendAttempts)
        .where(
          and(
            eq(inboxSendAttempts.workspaceId, input.workspaceId),
            eq(inboxSendAttempts.scope, scope),
            eq(inboxSendAttempts.state, "unknown"),
          ),
        )
        .limit(1);
      if (unknown && ctx.ai)
        throw new InboxCoordinationError("delivery_unknown");
      const [uncertain] = await db
        .select({ id: inboxSendAttempts.id })
        .from(inboxSendAttempts)
        .where(
          and(
            eq(inboxSendAttempts.workspaceId, input.workspaceId),
            eq(inboxSendAttempts.scope, scope),
            eq(inboxSendAttempts.fingerprint, fingerprint),
            inArray(inboxSendAttempts.state, [
              "reserved",
              "dispatching",
              "unknown",
            ]),
          ),
        )
        .limit(1);
      if (uncertain)
        throw new InboxCoordinationError("delivery_unknown", 409, {
          attemptId: uncertain.id,
        });
      if (unknown && input.actorId && input.reviewedRevision !== state.revision)
        throw new InboxCoordinationError("reply_conflict", 409, {
          ...state,
          uncertain: true,
        });

      if (ctx.ai) await aiAllowed(ctx);
      await db.transaction(async (tx) => {
        await tx.insert(inboxSendAttempts).values({
          id: attemptId,
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          conversationId: input.conversationId,
          actorId: input.actorId,
          scope,
          fingerprint,
        });
        if (input.actorId && !ctx.ai && input.conversationId) {
          const [conv] = await tx
            .select()
            .from(conversations)
            .where(eq(conversations.id, input.conversationId));
          if (!conv || conv.userId !== input.workspaceId)
            throw new InboxCoordinationError("conversation_unavailable", 404);
          await tx
            .update(conversations)
            .set({
              aiControl: pauseAiControl(
                { reason: "human_reply", actor: "user", userId: input.actorId },
                conv.aiControl,
              ),
            })
            .where(eq(conversations.id, conv.id));
        }
      });
      if (input.actorId && !ctx.ai && input.conversationId) {
        abortWebchatGeneration(input.conversationId);
        notifyUser(input.workspaceId, {
          type: "ai_control_changed",
          conversationId: input.conversationId,
          contactId: input.contactId,
        });
      }
      try {
        const result = await sending.run(ctx, work);
        const state = result.success
          ? "sent"
          : ctx.dispatched
            ? "unknown"
            : "failed";
        await db
          .update(inboxSendAttempts)
          .set({
            state,
            result: result as Record<string, unknown>,
            conversationId: result.conversationId || input.conversationId,
            updatedAt: new Date(),
          })
          .where(eq(inboxSendAttempts.id, attemptId));
        if (state === "unknown")
          throw new InboxCoordinationError("delivery_unknown", 409, {
            attemptId,
          });
        notifyUser(input.workspaceId, {
          type: "reply_state_changed",
          conversationId: result.conversationId || input.conversationId,
          contactId: input.contactId,
        });
        return result;
      } catch (error) {
        await db
          .update(inboxSendAttempts)
          .set({
            state: ctx.dispatched ? "unknown" : "failed",
            result: { success: false, error: "send_failed" },
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inboxSendAttempts.id, attemptId),
              ne(inboxSendAttempts.state, "sent"),
            ),
          );
        if (ctx.dispatched)
          throw new InboxCoordinationError("delivery_unknown", 409, {
            attemptId,
          });
        throw error;
      }
    })
    .catch(async (error) => {
      if (
        error?.cause?.constraint === "inbox_send_active_scope_idx" ||
        error?.constraint === "inbox_send_active_scope_idx"
      )
        throw new InboxCoordinationError("send_in_progress");
      if (
        error instanceof InboxCoordinationError &&
        error.code === "delivery_unknown"
      )
        await db
          .update(inboxSendAttempts)
          .set({ state: "unknown", updatedAt: new Date() })
          .where(
            and(
              eq(inboxSendAttempts.id, attemptId),
              inArray(inboxSendAttempts.state, ["reserved", "dispatching"]),
            ),
          );
      throw error;
    });
}
export function insideCoordinatedSend() {
  return !!sending.getStore();
}
export function humanSendInput(body: any) {
  if (
    typeof body?.sendAttemptId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.sendAttemptId) ||
    typeof body.replyRevision !== "string" ||
    body.replyRevision.length > 256
  )
    throw new InboxCoordinationError("reply_context_required", 428);
  return {
    attemptId: body.sendAttemptId,
    revision: body.replyRevision,
    reviewedRevision:
      typeof body.reviewedRevision === "string"
        ? body.reviewedRevision
        : undefined,
    aiEpoch: typeof body.aiEpoch === "number" ? body.aiEpoch : undefined,
  };
}
