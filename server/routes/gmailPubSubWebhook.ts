/**
 * Google Cloud Pub/Sub push webhook for Gmail mailbox updates.
 */
import type { Express, Request, Response } from "express";
import { normalizeEmailAddress } from "@shared/emailChannel";
import { authenticateGmailPubSubRequest } from "../emailChannel/gmailPubSubAuth";
import {
  logGmailPushEvent,
  redactEmailForLog,
  resolveGmailPubSubConfig,
} from "../emailChannel/gmailPushConfig";
import { findActiveGmailMailboxByEmail } from "../emailChannel/mailboxStore";
import { scheduleMailboxIncrementalSync } from "../emailChannel/gmailSyncTrigger";

type PubSubPushBody = {
  message?: {
    data?: string;
    messageId?: string;
    message_id?: string;
    publishTime?: string;
    publish_time?: string;
  };
  subscription?: string;
};

type GmailNotificationData = {
  emailAddress?: string;
  historyId?: number | string;
};

function decodePubSubData(dataB64: string): GmailNotificationData | null {
  try {
    const raw = Buffer.from(dataB64, "base64").toString("utf8");
    const parsed = JSON.parse(raw) as GmailNotificationData;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function registerGmailPubSubWebhookRoutes(app: Express): void {
  app.post("/api/webhooks/gmail/pubsub", async (req: Request, res: Response) => {
    const auth = await authenticateGmailPubSubRequest(req.headers.authorization);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.reason });
    }

    const config = resolveGmailPubSubConfig();
    if (!config.configured) {
      // Should not happen if JWT audience was validated, but keep soft.
      logGmailPushEvent("auth_rejected", { reason: "pubsub_not_configured" });
      return res.status(503).json({ error: "pubsub_not_configured" });
    }

    const body = (req.body || {}) as PubSubPushBody;
    const message = body.message;
    const messageId = String(message?.messageId || message?.message_id || "");
    if (!message?.data || typeof message.data !== "string") {
      logGmailPushEvent("payload_invalid", { pubsubMessageId: messageId || null, reason: "missing_data" });
      // ACK invalid but authenticated envelopes to avoid infinite retry of garbage.
      return res.status(204).send();
    }

    logGmailPushEvent("received", { pubsubMessageId: messageId || null });

    const decoded = decodePubSubData(message.data);
    if (!decoded) {
      logGmailPushEvent("payload_invalid", {
        pubsubMessageId: messageId || null,
        reason: "bad_base64_or_json",
      });
      return res.status(204).send();
    }

    const emailNorm = normalizeEmailAddress(decoded.emailAddress);
    const historyId =
      decoded.historyId != null && String(decoded.historyId).trim()
        ? String(decoded.historyId).trim()
        : null;

    if (!emailNorm || !historyId) {
      logGmailPushEvent("payload_invalid", {
        pubsubMessageId: messageId || null,
        reason: "missing_email_or_history",
        emailRedacted: redactEmailForLog(decoded.emailAddress),
      });
      return res.status(204).send();
    }

    const mailbox = await findActiveGmailMailboxByEmail(emailNorm);
    if (!mailbox) {
      logGmailPushEvent("mailbox_not_found", {
        pubsubMessageId: messageId || null,
        emailRedacted: redactEmailForLog(emailNorm),
        notificationHistoryId: historyId,
      });
      logGmailPushEvent("acked", { pubsubMessageId: messageId || null, result: "mailbox_not_found" });
      return res.status(204).send();
    }

    // Durable pending flag + async sync; ACK immediately.
    scheduleMailboxIncrementalSync({
      mailboxId: mailbox.id,
      source: "push",
      observedHistoryId: historyId,
    });

    logGmailPushEvent("trigger_accepted", {
      mailboxId: mailbox.id,
      workspaceId: mailbox.workspaceUserId,
      pubsubMessageId: messageId || null,
      notificationHistoryId: historyId,
      storedSyncCursor: mailbox.syncCursor ?? null,
    });
    logGmailPushEvent("acked", {
      mailboxId: mailbox.id,
      pubsubMessageId: messageId || null,
      result: "accepted",
    });

    return res.status(204).send();
  });
}
