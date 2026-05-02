import type { Express } from "express";
import { storage } from "../storage";
import { getMediaUrl, downloadMedia } from "../userMeta";
import fs from "fs";
import path from "path";
import { ObjectStorageService, ObjectNotFoundError } from "../replit_integrations/object_storage/objectStorage";

/** Same pattern as server/replit_integrations/object_storage/routes.ts for generated upload names */
const PROXY_OBJECTS_UPLOAD_FILENAME_RE =
  /^[\w][\w\-]*\.(jpg|jpeg|png|webp|pdf|mp3|m4a|ogg|mp4)$/i;

function extractObjectsUploadFilename(mediaUrl: string): string | null {
  try {
    const raw = mediaUrl.trim();
    const u =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw, "https://placeholder.local");
    const m = u.pathname.match(/\/objects\/uploads\/([^/]+)$/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Local multer/static /uploads/* — not GCS /objects/uploads */
function extractLocalDiskUploadFilename(mediaUrl: string): string | null {
  if (mediaUrl.includes("/objects/uploads/")) return null;
  try {
    const raw = mediaUrl.trim();
    const u =
      raw.startsWith("http://") || raw.startsWith("https://")
        ? new URL(raw)
        : new URL(raw, "https://placeholder.local");
    const idx = u.pathname.indexOf("/uploads/");
    if (idx === -1) return null;
    const rest = u.pathname.slice(idx + "/uploads/".length);
    const fn = path.basename(rest.split("?")[0] || "");
    return fn || null;
  } catch {
    return null;
  }
}

/**
 * Ensure JSON response never throws (BigInt, unexpected proxies). Null-safe on row fields.
 */
function sanitizeMessagesForResponse(rows: unknown): unknown[] {
  if (!Array.isArray(rows)) return [];
  try {
    return JSON.parse(
      JSON.stringify(rows, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
    ) as unknown[];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sanitizeMessagesForResponse] JSON clone failed", {
      message: msg,
      stack: e instanceof Error ? e.stack : undefined,
    });
    throw new Error(`sanitizeMessagesForResponse: ${msg}`);
  }
}

export function registerConversationRoutes(app: Express): void {
  // Get conversation messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
    const conversationId = req.params.id;
    const userId = req.user?.id ?? null;
    const t0 = Date.now();
    console.log("[GET /api/conversations/:id/messages] start", { conversationId, userId });
    try {
      if (!req.user) {
        console.warn("[GET /api/conversations/:id/messages] unauthorized");
        return res.status(401).json({ error: "Unauthorized" });
      }
      let conversation;
      try {
        conversation = await storage.getConversation(conversationId);
      } catch (e) {
        console.error("[GET /api/conversations/:id/messages] getConversation failed", {
          conversationId,
          userId,
          message: e instanceof Error ? e.message : String(e),
          stack: e instanceof Error ? e.stack : undefined,
        });
        return res.status(500).json({
          error: "Failed to load conversation",
          detail: e instanceof Error ? e.message : String(e),
        });
      }
      if (!conversation) {
        console.warn("[GET /api/conversations/:id/messages] conversation not found", { conversationId, userId });
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        console.warn("[GET /api/conversations/:id/messages] forbidden", { conversationId, userId });
        return res.status(403).json({ error: "Forbidden" });
      }
      const rawL = parseInt(String(req.query.limit ?? ""), 10);
      const rawO = parseInt(String(req.query.offset ?? ""), 10);
      const limit = Number.isFinite(rawL) ? rawL : 100;
      const offset = Number.isFinite(rawO) ? rawO : 0;
      const messages = await storage.getMessages(conversationId, limit, offset);
      const payload = sanitizeMessagesForResponse(messages);
      console.log("[GET /api/conversations/:id/messages] end", {
        conversationId,
        userId,
        rowCount: payload.length,
        ms: Date.now() - t0,
      });
      return res.json(payload);
    } catch (error) {
      console.error("[GET /api/conversations/:id/messages] fatal", {
        conversationId,
        userId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        ms: Date.now() - t0,
      });
      return res.status(500).json({
        error: "Failed to load messages",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Update conversation (status, etc.)
  app.patch("/api/conversations/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const allowed = ['status'];
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      const updated = await storage.updateConversation(req.params.id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating conversation:", error);
      res.status(500).json({ error: "Failed to update conversation" });
    }
  });

  // Mark conversation as read
  app.post("/api/conversations/:id/read", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.updateConversation(req.params.id, { unreadCount: 0 });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ error: "Failed to mark as read" });
    }
  });

  // ---------------------------------------------------------------------------
  // Media proxy — streams inbound media for a given message
  //
  // Strategy per channel:
  //   WhatsApp  : platform_media_id holds the Meta media ID. We call getMediaUrl()
  //               to get a fresh signed URL, then download with Bearer auth.
  //               Works across restarts/redeploys indefinitely (Meta keeps IDs).
  //               Backward compat: falls back to media_filename for rows created
  //               before the platform_media_id column was added.
  //
  //   Facebook  : media_url holds the Facebook CDN URL (stored at receipt time).
  //               These are publicly accessible but expire after ~hours/days.
  //               We fetch and pipe them directly. If the URL has expired we
  //               return 410 Gone so the UI can show a "media expired" notice.
  //
  //   Outbound  : media_url may be /objects/uploads, /uploads, or a remote URL.
  //               Proxy resolves object storage + local disk + canonical APP_URL.
  //
  // All errors are logged with messageId, channel, and reason for easy debugging.
  // ---------------------------------------------------------------------------
  app.get("/api/media/proxy", async (req, res) => {
    const messageId = req.query.messageId as string;
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (!messageId) return res.status(400).json({ error: "messageId required" });

      const message = await storage.getMessage(messageId);
      if (!message) {
        console.warn(`[MediaProxy] messageId=${messageId} reason=message_not_found`);
        return res.status(404).json({ error: "Message not found" });
      }

      // Security: message must belong to the requesting user's account
      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.userId !== req.user.id) {
        console.warn(
          `[MediaProxy] messageId=${messageId} reason=forbidden userId=${req.user.id}`
        );
        return res.status(403).json({ error: "Forbidden" });
      }

      const channel = conversation.channel;

      // ------------------------------------------------------------------
      // Determine MIME type from contentType field
      // ------------------------------------------------------------------
      function mimeFromContentType(ct: string | null): string {
        switch (ct) {
          case 'image':    return 'image/jpeg';
          case 'video':    return 'video/mp4';
          case 'audio':    return 'audio/ogg';
          case 'document': return 'application/pdf';
          default:         return 'application/octet-stream';
        }
      }

      // ------------------------------------------------------------------
      // WhatsApp: platform_media_id = Meta media ID → fetch fresh URL on demand
      // Backward compat: fall back to media_filename for pre-migration rows
      // ------------------------------------------------------------------
      const whatsappMediaId = message.platformMediaId || (!message.mediaUrl ? message.mediaFilename : null);
      if (whatsappMediaId && !message.mediaUrl) {
        const idSource = message.platformMediaId ? 'platform_media_id' : 'media_filename (legacy)';
        console.log(`[MediaProxy] messageId=${messageId} channel=whatsapp mediaId=${whatsappMediaId} (from ${idSource}) — fetching fresh URL`);
        const freshUrl = await getMediaUrl(req.user.id, whatsappMediaId);
        if (!freshUrl) {
          console.error(
            `[MediaProxy] messageId=${messageId} channel=whatsapp reason=getMediaUrl_null (token invalid or media expired)`
          );
          return res.status(502).json({ error: "Could not retrieve WhatsApp media URL. Check Meta credentials." });
        }

        const buffer = await downloadMedia(req.user.id, freshUrl);
        if (!buffer) {
          console.error(
            `[MediaProxy] messageId=${messageId} channel=whatsapp reason=downloadMedia_failed url=${freshUrl.substring(0, 80)}`
          );
          return res.status(502).json({ error: "Could not download WhatsApp media." });
        }

        const mime = mimeFromContentType(message.contentType);
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'private, max-age=300');
        if (message.contentType === 'document') {
          res.set('Content-Disposition', `attachment; filename="document.pdf"`);
        } else {
          res.set('Content-Disposition', 'inline');
        }
        console.log(`[MediaProxy] messageId=${messageId} channel=whatsapp — served ${buffer.length} bytes, mime=${mime}`);
        return res.send(buffer);
      }

      // ------------------------------------------------------------------
      // Stored media_url: GCS /objects/uploads, local /uploads, remote CDN / URL
      // ------------------------------------------------------------------
      if (message.mediaUrl) {
        const rawMediaUrl = message.mediaUrl.trim();
        const objectFn = extractObjectsUploadFilename(rawMediaUrl);
        const localFn = extractLocalDiskUploadFilename(rawMediaUrl);
        const appBase = (process.env.APP_URL || "").replace(/\/$/, "");

        // 1) Object storage (survives redeploy; works when DB still has old host in URL)
        if (objectFn && PROXY_OBJECTS_UPLOAD_FILENAME_RE.test(objectFn) && process.env.PRIVATE_OBJECT_DIR) {
          try {
            const oss = new ObjectStorageService();
            const objectFile = await oss.getObjectEntityFile(`/objects/uploads/${objectFn}`);
            const [metadata] = await objectFile.getMetadata();
            const [downloaded] = await objectFile.download();
            const buf = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
            const ct =
              (metadata.contentType as string | undefined) || mimeFromContentType(message.contentType);
            res.set("X-Content-Type-Options", "nosniff");
            res.set("Content-Type", ct);
            res.set("Cache-Control", "private, max-age=3600");
            if (message.contentType === "document") {
              res.set("Content-Disposition", `attachment; filename="${objectFn}"`);
            } else {
              res.set("Content-Disposition", "inline");
            }
            console.log(
              `[MediaProxy] messageId=${messageId} channel=${channel} reason=served_object_storage bytes=${buf.length} mime=${ct} fn=${objectFn}`
            );
            return res.send(buf);
          } catch (e: any) {
            if (e instanceof ObjectNotFoundError) {
              console.warn(
                `[MediaProxy] messageId=${messageId} channel=${channel} reason=object_not_in_bucket filename=${objectFn}`
              );
            } else {
              console.warn(
                `[MediaProxy] messageId=${messageId} channel=${channel} reason=object_storage_read_error err=${e?.message || e}`
              );
            }
          }
        } else if (objectFn && !process.env.PRIVATE_OBJECT_DIR) {
          console.warn(
            `[MediaProxy] messageId=${messageId} channel=${channel} reason=no_PRIVATE_OBJECT_DIR path=/objects/uploads/${objectFn}`
          );
        } else if (objectFn && !PROXY_OBJECTS_UPLOAD_FILENAME_RE.test(objectFn)) {
          console.warn(
            `[MediaProxy] messageId=${messageId} channel=${channel} reason=object_filename_not_allowed filename=${objectFn}`
          );
        }

        // 2) Local disk /uploads/* (dev / ephemeral — not under /objects/uploads)
        if (localFn) {
          const filepath = path.join(process.cwd(), "uploads", localFn);
          if (fs.existsSync(filepath)) {
            const mime = mimeFromContentType(message.contentType);
            res.set("Content-Type", mime);
            res.set("Cache-Control", "private, max-age=3600");
            if (message.contentType === "document") {
              res.set("Content-Disposition", `attachment; filename="${localFn}"`);
            } else {
              res.set("Content-Disposition", "inline");
            }
            console.log(
              `[MediaProxy] messageId=${messageId} channel=${channel} reason=served_local_disk path=${filepath}`
            );
            return res.sendFile(filepath);
          }
          console.warn(
            `[MediaProxy] messageId=${messageId} channel=${channel} reason=local_upload_missing path=${filepath}`
          );
        }

        // 3) Remote fetch — stored URL then canonical APP_URL (migration / host drift)
        const candidateUrls: string[] = [];
        const pushUrl = (u: string) => {
          if (u && !candidateUrls.includes(u)) candidateUrls.push(u);
        };
        pushUrl(rawMediaUrl);
        if (appBase && objectFn && PROXY_OBJECTS_UPLOAD_FILENAME_RE.test(objectFn)) {
          pushUrl(`${appBase}/objects/uploads/${objectFn}`);
        }
        if (appBase && localFn) {
          pushUrl(`${appBase}/uploads/${localFn}`);
        }

        let lastStatus = 0;
        for (let i = 0; i < candidateUrls.length; i++) {
          const url = candidateUrls[i];
          console.log(
            `[MediaProxy] messageId=${messageId} channel=${channel} reason=fetch_attempt idx=${i} url=${url.substring(0, 120)}`
          );
          let response: globalThis.Response;
          try {
            response = await fetch(url, { signal: AbortSignal.timeout(15000) });
          } catch (fetchErr: any) {
            console.warn(
              `[MediaProxy] messageId=${messageId} channel=${channel} reason=fetch_network_error url=${url.substring(0, 80)} err=${fetchErr?.message || fetchErr}`
            );
            continue;
          }
          lastStatus = response.status;
          if (!response.ok) {
            const errTxt = (await response.text()).slice(0, 240);
            console.warn(
              `[MediaProxy] messageId=${messageId} channel=${channel} reason=fetch_http_error status=${response.status} url=${url.substring(0, 100)} body=${errTxt}`
            );
            if (response.status === 403 || response.status === 410) {
              return res.status(410).json({
                error: "Media has expired and is no longer available from the platform.",
              });
            }
            continue;
          }

          const ct = response.headers.get("content-type") || mimeFromContentType(message.contentType);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          res.set("Content-Type", ct);
          res.set("Cache-Control", "private, max-age=300");
          if (message.contentType === "document") {
            res.set("Content-Disposition", `attachment; filename="document"`);
          } else {
            res.set("Content-Disposition", "inline");
          }
          console.log(
            `[MediaProxy] messageId=${messageId} channel=${channel} reason=served_remote bytes=${buffer.length} mime=${ct} url=${url.substring(0, 100)}`
          );
          return res.send(buffer);
        }

        console.error(
          `[MediaProxy] messageId=${messageId} channel=${channel} reason=all_candidates_failed lastHttpStatus=${lastStatus} tried=${candidateUrls.length}`
        );
        if (lastStatus === 403 || lastStatus === 410) {
          return res.status(410).json({
            error: "Media has expired and is no longer available from the platform.",
          });
        }
        return res.status(502).json({ error: "Could not retrieve media from any known location." });
      }

      // Nothing to serve
      console.warn(
        `[MediaProxy] messageId=${messageId} channel=${channel} reason=no_media_in_db contentType=${message.contentType}`
      );
      return res.status(404).json({ error: "No media available for this message." });

    } catch (error: any) {
      console.error(
        `[MediaProxy] messageId=${messageId} reason=unhandled_exception err=${error?.message || error}`
      );
      res.status(500).json({ error: "Media proxy failed" });
    }
  });

  // Get messaging window status for Meta channels (Instagram, Facebook)
  app.get("/api/conversations/:id/window-status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conversation = await storage.getConversation(req.params.id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      if (conversation.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      // WhatsApp also enforces a 24-hour messaging window, same as Instagram/Facebook.
      // Channels without any window restriction (SMS, Telegram, webchat, etc.) can
      // always send; we return isActive:true with no restriction for those.
      const windowChannels = ['whatsapp', 'instagram', 'facebook'];
      if (!windowChannels.includes(conversation.channel)) {
        return res.json({
          isActive: true,
          hasRestriction: false,
          channel: conversation.channel,
        });
      }

      const now = new Date();
      const windowExpiresAt = conversation.windowExpiresAt
        ? new Date(conversation.windowExpiresAt)
        : null;
      const WHATSAPP_CSW_BUFFER_MS = 60 * 60 * 1000;
      let isActive: boolean;
      let hoursRemaining: number;
      if (conversation.channel === 'whatsapp' && windowExpiresAt) {
        const freeFormDeadline = new Date(windowExpiresAt.getTime() - WHATSAPP_CSW_BUFFER_MS);
        isActive = freeFormDeadline > now;
        hoursRemaining = Math.max(0, (freeFormDeadline.getTime() - now.getTime()) / (1000 * 60 * 60));
      } else if (windowExpiresAt) {
        isActive = windowExpiresAt > now;
        hoursRemaining = Math.max(0, (windowExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
      } else {
        isActive = false;
        hoursRemaining = 0;
      }
      const isExpiringSoon =
        conversation.channel === 'whatsapp'
          ? hoursRemaining > 0 && hoursRemaining < 2
          : hoursRemaining > 0 && hoursRemaining < 4;

      res.json({
        hasRestriction: true,
        isActive,
        windowExpiresAt,
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        isExpiringSoon,
        channel: conversation.channel,
        message: !isActive
          ? `24-hour reply window closed. You can still receive their messages, but you can't send new ones until they message you first.`
          : isExpiringSoon
          ? `Reply window closes in ${Math.round(hoursRemaining)} hour${Math.round(hoursRemaining) === 1 ? '' : 's'} — reply soon. You can always receive their messages.`
          : null,
      });
    } catch (error) {
      console.error("Error getting window status:", error);
      res.status(500).json({ error: "Failed to get window status" });
    }
  });
}
