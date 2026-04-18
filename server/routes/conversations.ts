import type { Express } from "express";
import { storage } from "../storage";
import { getMediaUrl, downloadMedia } from "../userMeta";
import fs from "fs";
import path from "path";

export function registerConversationRoutes(app: Express): void {
  // Get conversation messages
  app.get("/api/conversations/:id/messages", async (req, res) => {
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
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const messages = await storage.getMessages(req.params.id, limit, offset);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
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
  //   Outbound  : media_url is a direct external or /uploads/ URL. We pipe it.
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
        console.warn(`[MediaProxy] messageId=${messageId} — not found in DB`);
        return res.status(404).json({ error: "Message not found" });
      }

      // Security: message must belong to the requesting user's account
      const conversation = await storage.getConversation(message.conversationId);
      if (!conversation || conversation.userId !== req.user.id) {
        console.warn(`[MediaProxy] messageId=${messageId} — forbidden for userId=${req.user.id}`);
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
          console.error(`[MediaProxy] messageId=${messageId} channel=whatsapp — getMediaUrl returned null (token invalid or mediaId expired)`);
          return res.status(502).json({ error: "Could not retrieve WhatsApp media URL. Check Meta credentials." });
        }

        const buffer = await downloadMedia(req.user.id, freshUrl);
        if (!buffer) {
          console.error(`[MediaProxy] messageId=${messageId} channel=whatsapp — downloadMedia failed for url=${freshUrl.substring(0, 80)}`);
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
      // Facebook / outbound / other: media_url is a direct URL
      // ------------------------------------------------------------------
      if (message.mediaUrl) {
        // Local /uploads/ files — serve directly from disk
        if (message.mediaUrl.startsWith('/uploads/') || message.mediaUrl.includes('/uploads/')) {
          const filename = path.basename(message.mediaUrl.split('/uploads/')[1] || '');
          const filepath = path.join(process.cwd(), 'uploads', filename);
          if (fs.existsSync(filepath)) {
            const mime = mimeFromContentType(message.contentType);
            res.set('Content-Type', mime);
            res.set('Cache-Control', 'private, max-age=3600');
            if (message.contentType === 'document') {
              res.set('Content-Disposition', `attachment; filename="${filename}"`);
            } else {
              res.set('Content-Disposition', 'inline');
            }
            console.log(`[MediaProxy] messageId=${messageId} — served from local disk: ${filepath}`);
            return res.sendFile(filepath);
          }
          // File not on disk (e.g. after redeploy) — fall through to remote fetch
          console.warn(`[MediaProxy] messageId=${messageId} — local file missing: ${filepath}, falling through to remote`);
        }

        console.log(`[MediaProxy] messageId=${messageId} channel=${channel} — fetching remote url=${message.mediaUrl.substring(0, 80)}`);
        let response: Response;
        try {
          response = await fetch(message.mediaUrl, { signal: AbortSignal.timeout(15000) });
        } catch (fetchErr: any) {
          console.error(`[MediaProxy] messageId=${messageId} channel=${channel} — fetch threw: ${fetchErr?.message}`);
          return res.status(502).json({ error: "Network error fetching media." });
        }

        if (!response.ok) {
          if (response.status === 403 || response.status === 410) {
            console.warn(`[MediaProxy] messageId=${messageId} channel=${channel} — CDN URL expired (status ${response.status})`);
            return res.status(410).json({ error: "Media has expired and is no longer available from the platform." });
          }
          console.error(`[MediaProxy] messageId=${messageId} channel=${channel} — remote returned HTTP ${response.status}`);
          return res.status(502).json({ error: `Remote media server returned ${response.status}` });
        }

        const ct = response.headers.get('content-type') || mimeFromContentType(message.contentType);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.set('Content-Type', ct);
        res.set('Cache-Control', 'private, max-age=300');
        if (message.contentType === 'document') {
          res.set('Content-Disposition', `attachment; filename="document"`);
        } else {
          res.set('Content-Disposition', 'inline');
        }
        console.log(`[MediaProxy] messageId=${messageId} channel=${channel} — served ${buffer.length} bytes, mime=${ct}`);
        return res.send(buffer);
      }

      // Nothing to serve
      console.warn(`[MediaProxy] messageId=${messageId} channel=${channel} contentType=${message.contentType} — no mediaUrl or mediaFilename in DB`);
      return res.status(404).json({ error: "No media available for this message." });

    } catch (error: any) {
      console.error(`[MediaProxy] messageId=${messageId} — unhandled error: ${error?.message || error}`);
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
      const isActive = windowExpiresAt ? windowExpiresAt > now : false;
      const hoursRemaining = windowExpiresAt
        ? Math.max(0, (windowExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60))
        : 0;
      const isExpiringSoon = hoursRemaining > 0 && hoursRemaining < 4;

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
