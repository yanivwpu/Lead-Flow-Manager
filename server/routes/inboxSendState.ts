import type { Express } from "express";
import { isEmailVerified } from "../authSecurity";
import { CHANNELS } from "@shared/schema";
import { storage } from "../storage";
import {
  requireInboxWorkspace,
  inboxWorkspaceId,
} from "../inboxWorkspaceAccess";
import { inboxContentReadLimiter } from "../inboxContentRateLimit";
import { replyState } from "../inboxSendCoordination";
export function registerInboxSendStateRoutes(app: Express) {
  const handler: import("express").RequestHandler = async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      if (req.user.deletionRequestedAt || !isEmailVerified(req.user))
        return res.status(403).json({ error: "Account verification required" });
      const personal = req.path === "/api/templates/reply-state";

      const workspaceId = personal ? req.user.id : inboxWorkspaceId(req);
      let contactId = req.params.id || req.body?.contactId;
      if (!contactId && req.body?.chatId) {
        const chat = await storage.getChat(req.body.chatId);
        if (!chat || chat.userId !== workspaceId)
          return res.status(404).json({ error: "Not found" });
        contactId = (
          await storage.getContactByChannelId(
            workspaceId,
            "whatsapp",
            (chat.whatsappPhone || "").replace(/\D/g, ""),
          )
        )?.id;
      }
      const contact =
        typeof contactId === "string"
          ? await storage.getContact(contactId)
          : null;
      if (!contact || contact.userId !== workspaceId)
        return res.status(404).json({ error: "Not found" });
      const channel =
        typeof req.body?.channel === "string" ? req.body.channel : "whatsapp";
      if (!(CHANNELS as readonly string[]).includes(channel))
        return res.status(400).json({ error: "Invalid channel" });
      const conv = req.body?.newEmail
        ? null
        : req.body?.conversationId
          ? await storage.getConversation(req.body.conversationId)
          : await storage.getConversationByContactAndChannel(
              contact.id,
              channel as any,
            );
      if (req.body?.conversationId && !conv)
        return res.status(404).json({ error: "Not found" });
      if (
        conv &&
        (conv.userId !== workspaceId ||
          conv.contactId !== contact.id ||
          conv.channel !== channel)
      )
        return res.status(404).json({ error: "Not found" });
      const state = await replyState({
        workspaceId,
        contactId: contact.id,
        channel,
        conversationId: conv?.id,
      });
      const latest = conv
        ? (await storage.getMessages(conv.id, 20))
            .reverse()
            .find(
              (m) =>
                m.userId === workspaceId &&
                m.contactId === contact.id &&
                m.direction === "outbound" &&
                m.status !== "failed",
            )
        : null;
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ...state,
        conversationId: conv?.id || null,
        aiEpoch: (conv?.aiControl as any)?.generationEpoch || 0,
        latestReply: latest
          ? {
              id: latest.id,
              content: latest.content?.slice(0, 2000) || "",
              createdAt: latest.createdAt,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  };
  app.post(
    "/api/contacts/:id/reply-state",
    inboxContentReadLimiter,
    requireInboxWorkspace,
    handler,
  );
  app.post("/api/templates/reply-state", inboxContentReadLimiter, handler);
}
