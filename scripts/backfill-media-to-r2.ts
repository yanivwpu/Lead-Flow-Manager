/**
 * Backfill: re-download provider media and store to R2 / legacy storage.
 *
 * Usage: DATABASE_URL=... CLOUDFLARE_R2_*=... npx tsx scripts/backfill-media-to-r2.ts
 *
 * Selects inbound rows where media_storage_key is null and we still have a
 * provider URL or a transient-looking media_url.
 */

import "dotenv/config";
import { and, eq, isNull, isNotNull, or, sql, desc } from "drizzle-orm";
import { db } from "../drizzle/db";
import { messages, conversations } from "../shared/schema";
import {
  persistInboundMedia,
  looksLikeTransientProviderUrl,
  type PersistInboundMediaAuth,
} from "../server/mediaStorageService";
import { storage } from "../server/storage";
import { isEncrypted, decryptCredential } from "../server/userTwilio";

const BATCH = 100;

async function buildAuth(
  userId: string,
  channel: string,
  providerUrl: string | null
): Promise<PersistInboundMediaAuth> {
  if (channel === "facebook" || channel === "instagram") {
    const setting = await storage.getChannelSetting(
      userId,
      channel as "facebook" | "instagram"
    );
    const token = (setting?.config as { accessToken?: string })?.accessToken;
    return token ? { kind: "meta-page-bearer", accessToken: token } : { kind: "public" };
  }
  if (
    (channel === "whatsapp" || channel === "sms") &&
    providerUrl &&
    /twilio\.com/i.test(providerUrl)
  ) {
    const user = await storage.getUser(userId);
    if (user?.twilioAccountSid && user?.twilioAuthToken) {
      const tok = isEncrypted(user.twilioAuthToken)
        ? decryptCredential(user.twilioAuthToken)
        : user.twilioAuthToken;
      return { kind: "twilio-basic", accountSid: user.twilioAccountSid, authToken: tok };
    }
  }
  return { kind: "public" };
}

async function main() {
  const rows = await db
    .select({
      msg: messages,
      channel: conversations.channel,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.direction, "inbound"),
        isNull(messages.mediaStorageKey),
        or(
          isNotNull(messages.providerMediaUrl),
          sql`(${messages.mediaUrl}) ~* '(fbcdn\\.net|facebook\\.com|fbsbx\\.com|lookaside\\.fbsbx\\.com|twilio\\.com|graph\\.facebook\\.com)'`
        )
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(BATCH);

  console.log(`[backfill-media] candidates=${rows.length}`);

  for (const { msg, channel } of rows) {
    const userId = msg.userId;
    const providerUrl =
      (msg.providerMediaUrl && String(msg.providerMediaUrl).trim()) ||
      (msg.mediaUrl && looksLikeTransientProviderUrl(msg.mediaUrl) ? msg.mediaUrl : null);
    const providerId = msg.providerMediaId || msg.platformMediaId || null;

    if (!providerUrl && !providerId) {
      console.log(`[backfill-media] skip messageId=${msg.id} (no provider url/id)`);
      continue;
    }

    let auth = await buildAuth(userId, channel, providerUrl);
    if (channel === "whatsapp" && providerId && !providerUrl) {
      auth = { kind: "meta-whatsapp-user", userId };
    }

    const persisted = await persistInboundMedia({
      channel,
      userId,
      providerMediaUrl: providerUrl,
      providerMediaId: providerId,
      mediaType: msg.contentType || "document",
      mimeType: msg.mediaMimeType || null,
      filename: msg.mediaFilename || null,
      auth,
    });

    if (!persisted) {
      console.warn(`[backfill-media] FAILED messageId=${msg.id} channel=${channel}`);
      continue;
    }

    await storage.updateMessage(msg.id, {
      mediaUrl: persisted.mediaUrl,
      providerMediaUrl: persisted.providerMediaUrl ?? msg.providerMediaUrl ?? providerUrl,
      providerMediaId: persisted.providerMediaId ?? msg.providerMediaId ?? providerId,
      mediaMimeType: persisted.mediaMimeType,
      mediaSize: persisted.mediaSize,
      mediaStorageKey: persisted.mediaStorageKey,
      mediaStoredAt: persisted.mediaStoredAt,
      mediaType: persisted.mediaMimeType,
    });
    console.log(`[backfill-media] OK messageId=${msg.id} -> ${persisted.mediaUrl.slice(0, 80)}…`);
  }

  console.log("[backfill-media] done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
