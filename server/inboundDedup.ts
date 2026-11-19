import { INBOUND_DEDUP_SCHEMA_SQL } from "./inboundDedupSchema";
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { messages, type InsertMessage, type Message } from '@shared/schema';

export class InboundRetryError extends Error {
  readonly status = 503;
  constructor() { super('Inbound delivery is pending; retry with the same message ID'); }
}
export class InboundDuplicateError extends Error {
  readonly code = '23505';
  readonly constraint = 'messages_user_external_message_id_uq';
}
type Claim = { userId: string; channel: string; externalId: string; token: string };
const claims = new AsyncLocalStorage<Claim>();
const leaseMs = 120_000;
const rows = (r: any): any[] => r.rows || r;
function key(c: Claim) {
  return sql`user_id=${c.userId} AND channel=${c.channel} AND external_message_id=${c.externalId}`;
}

/** Telegram message_id is unique within a chat, not across the owner's bot. */
export function telegramInboundExternalId(chatId: string, providerId: string): string {
  return providerId.startsWith(`telegram:${chatId}:`) ? providerId : `telegram:${chatId}:${providerId}`;
}
export function inboundMessageIdPredicate(userId: string, externalId: string, channel?: string) {
  const legacy = channel === 'telegram' ? /^telegram:([^:]+):(.+)$/.exec(externalId) : null;
  return legacy ? sql`(${messages.externalMessageId}=${externalId} OR
    (${messages.externalMessageId}=${legacy[2]} AND ${messages.contactId} IN
      (SELECT id FROM contacts WHERE user_id=${userId} AND telegram_id=${legacy[1]})))`
    : sql`${messages.externalMessageId}=${externalId}`;
}

/** Nonblocking durable claim. Contenders receive 503, never consume a pool slot waiting on AI. */
export async function withInboundEvent<T>(userId: string, channel: string, externalId: string | undefined, work: () => Promise<T>): Promise<T> {
  if (!externalId) return work();
  const parent = claims.getStore();
  if (parent?.userId === userId && parent.channel === channel && parent.externalId === externalId) return work();
  const claim: Claim = { userId, channel, externalId, token: randomUUID() };
  await db.transaction(async tx => {
    await tx.execute(sql`INSERT INTO inbound_message_receipts(user_id,channel,external_message_id)
      VALUES(${userId},${channel},${externalId}) ON CONFLICT DO NOTHING`);
    const [receipt] = rows(await tx.execute(sql`SELECT claim_token,lease_until FROM inbound_message_receipts WHERE ${key(claim)} FOR UPDATE`));
    // A legacy duplicate group is resolved deterministically, without editing any historical row.
    const [existing] = rows(await tx.execute(sql`SELECT messages.id FROM messages JOIN conversations c ON c.id=messages.conversation_id
      WHERE messages.user_id=${userId} AND messages.direction='inbound' AND ${inboundMessageIdPredicate(userId, externalId, channel)} AND c.channel=${channel} AND c.user_id=${userId}
      ORDER BY messages.created_at ASC NULLS LAST,messages.id ASC LIMIT 1`));
    if (existing) {
      await tx.execute(sql`UPDATE inbound_message_receipts SET message_id=${existing.id} WHERE ${key(claim)}`);
      return;
    }
    if (receipt.claim_token && receipt.lease_until && new Date(receipt.lease_until).getTime() > Date.now()) throw new InboundRetryError();
    await tx.execute(sql`UPDATE inbound_message_receipts SET claim_token=${claim.token}::uuid,
      lease_until=now()+${leaseMs}*interval '1 millisecond' WHERE ${key(claim)}`);
  });
  // Only this receipt is renewed. No provider calls are retried by this coordinator.
  const heartbeat = setInterval(() => {
    void db.execute(sql`UPDATE inbound_message_receipts SET lease_until=now()+${leaseMs}*interval '1 millisecond'
      WHERE ${key(claim)} AND claim_token=${claim.token}::uuid AND message_id IS NULL`).catch(() => {});
  }, 20_000);
  heartbeat.unref();
  try { return await claims.run(claim, work); }
  finally {
    clearInterval(heartbeat);
    await db.execute(sql`UPDATE inbound_message_receipts SET claim_token=NULL,lease_until=NULL
      WHERE ${key(claim)} AND claim_token=${claim.token}::uuid`).catch(() => {});
  }
}

/** Claim ownership and message persistence commit atomically. A recovered owner fences the old process. */
export async function persistClaimedInbound(message: InsertMessage): Promise<Message | undefined> {
  const claim = claims.getStore();
  if (!claim || message.direction !== 'inbound' || message.userId !== claim.userId || message.externalMessageId !== claim.externalId) return undefined;
  return db.transaction(async tx => {
    const [receipt] = rows(await tx.execute(sql`SELECT claim_token,message_id FROM inbound_message_receipts WHERE ${key(claim)} FOR UPDATE`));
    if (receipt?.message_id) throw new InboundDuplicateError();
    if (receipt?.claim_token !== claim.token) throw new InboundRetryError();
    const [target] = rows(await tx.execute(sql`SELECT c.id FROM conversations c JOIN contacts p ON p.id=c.contact_id
      WHERE c.id=${message.conversationId} AND c.user_id=${claim.userId} AND c.channel=${claim.channel}
      AND p.id=${message.contactId} AND p.user_id=${claim.userId}`));
    if (!target) throw new InboundRetryError();
    const [saved] = await tx.insert(messages).values(message).returning();
    await tx.execute(sql`UPDATE inbound_message_receipts SET message_id=${saved.id},lease_until=NULL WHERE ${key(claim)}`);
    return saved;
  });
}

export async function ensureInboundDedupSchema(): Promise<void> {
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('whachat:inbound-receipts-schema',0))`);
    await tx.execute(sql.raw(INBOUND_DEDUP_SCHEMA_SQL));
  });
}
