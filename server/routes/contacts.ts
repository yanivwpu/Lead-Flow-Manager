import type { Express } from "express";
import { storage } from "../storage";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function resolveEntityForNotes(id: string): Promise<{ userId: string } | null> {
  const contact = await storage.getContact(id);
  if (contact) return { userId: contact.userId };
  const chat = await storage.getChat(id);
  if (chat) return { userId: chat.userId };
  return null;
}

export function registerContactRoutes(app: Express): void {
  // Get all contacts
  app.get("/api/contacts", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const limit = parseInt(req.query.limit as string) || 1000;
      const contacts = await storage.getContacts(req.user.id, limit);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  // Search contacts — must be BEFORE /:id
  app.get("/api/contacts/search", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ error: "Search query required" });
      }
      const contacts = await storage.searchContacts(req.user.id, query);
      res.json(contacts);
    } catch (error) {
      console.error("Error searching contacts:", error);
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });

  // Notes summary — MUST be before /:id to avoid Express treating "notes-summary" as an id param
  app.get("/api/contacts/notes-summary", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { db } = await import("../db");
      const { contactNotes } = await import("@shared/schema");
      const { sql, eq } = await import("drizzle-orm");
      const rows = await db
        .select({
          contactId: contactNotes.contactId,
          count: sql<number>`count(*)::int`,
        })
        .from(contactNotes)
        .where(eq(contactNotes.workspaceId, req.user.id))
        .groupBy(contactNotes.contactId);
      const summary: Record<string, number> = {};
      rows.forEach((r) => { if (r.contactId) summary[r.contactId] = r.count; });
      res.json(summary);
    } catch (error) {
      console.error("Error fetching notes summary:", error);
      res.status(500).json({ error: "Failed" });
    }
  });

  // Get single contact with all conversations
  app.get("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await storage.getContactWithConversations(req.params.id);
      if (!result) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (result.contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      res.json(result);
    } catch (error) {
      console.error("Error fetching contact:", error);
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  // Create new contact
  app.post("/api/contacts", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.createContact({
        ...req.body,
        userId: req.user.id,
      });
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Update contact
  app.patch("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const updated = await storage.updateContact(req.params.id, req.body);

      // Sync tag change back to GHL if contact has a GHL ID (fire-and-forget)
      if ('tag' in req.body && contact.ghlId) {
        const tags = req.body.tag ? [req.body.tag as string] : [];
        import('../ghlSync').then(({ ghlSyncContactTags }) => {
          ghlSyncContactTags(req.user!.id, contact.ghlId!, tags).catch(() => {});
        }).catch(() => {});
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Delete contact
  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      await storage.deleteContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  // Merge two contacts: POST /api/contacts/:id/merge { sourceId }
  // :id = target (kept), sourceId = duplicate (deleted after all data moved to target)
  app.post("/api/contacts/:id/merge", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { sourceId } = req.body;
      if (!sourceId || typeof sourceId !== "string") {
        return res.status(400).json({ error: "sourceId is required" });
      }
      const targetId = req.params.id;
      if (targetId === sourceId) {
        return res.status(400).json({ error: "target and source must be different contacts" });
      }

      const [target, source] = await Promise.all([
        storage.getContact(targetId),
        storage.getContact(sourceId),
      ]);
      if (!target) return res.status(404).json({ error: "Target contact not found" });
      if (!source) return res.status(404).json({ error: "Source contact not found" });
      if (target.userId !== req.user.id || source.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const merged = await storage.mergeContacts(targetId, sourceId);
      res.json(merged);
    } catch (error) {
      console.error("Error merging contacts:", error);
      res.status(500).json({ error: "Failed to merge contacts" });
    }
  });

  // Switch primary channel for a contact
  app.patch("/api/contacts/:id/channel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const { channel } = req.body;
      const validChannels = ['whatsapp', 'instagram', 'facebook', 'sms', 'webchat', 'telegram'];
      if (!channel || !validChannels.includes(channel)) {
        return res.status(400).json({ error: "Invalid channel" });
      }

      const updated = await storage.updateContact(req.params.id, {
        primaryChannelOverride: channel,
      });

      const { channelService } = await import("../channelService");
      await channelService.logActivity(
        req.user.id,
        req.params.id,
        undefined,
        'channel_switch',
        {
          from: contact.primaryChannel,
          to: channel,
          reason: 'manual_switch',
        },
        'user',
        req.user.id
      );

      res.json(updated);
    } catch (error) {
      console.error("Error switching channel:", error);
      res.status(500).json({ error: "Failed to switch channel" });
    }
  });

  // Send message to contact (auto channel selection)
  app.post("/api/contacts/:id/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { channelService } = await import("../channelService");
      const result = await channelService.sendMessage({
        userId: req.user.id,
        contactId: req.params.id,
        content: req.body.content,
        contentType: req.body.contentType || 'text',
        mediaUrl: req.body.mediaUrl,
        forceChannel: req.body.channel,
      });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ error: "Failed to send message" });
    }
  });

  // Get Team Notes for a contact or chat
  app.get("/api/contacts/:id/notes", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const entity = await resolveEntityForNotes(req.params.id);
      if (!entity) return res.status(404).json({ error: "Not found" });
      if (entity.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const notes = await storage.getContactNotes(entity.userId, req.params.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching contact notes:", error);
      res.status(500).json({ error: "Failed to fetch contact notes" });
    }
  });

  // Add a Team Note to a contact or chat
  app.post("/api/contacts/:id/notes", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const entity = await resolveEntityForNotes(req.params.id);
      if (!entity) return res.status(404).json({ error: "Not found" });
      if (entity.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Content is required" });
      const note = await storage.addContactNote({
        workspaceId: entity.userId,
        contactId: req.params.id,
        content: content.trim(),
        createdByUserId: req.user.id,
        createdByName: req.user.name || req.user.email || "Team member",
      });
      res.json(note);
    } catch (error) {
      console.error("Error adding contact note:", error);
      res.status(500).json({ error: "Failed to add note" });
    }
  });

  // Delete a Team Note
  app.delete("/api/contacts/:id/notes/:noteId", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { noteId } = req.params;

      const note = await storage.getContactNoteById(noteId);
      if (!note) return res.status(404).json({ error: "Note not found" });

      // Workspace owner check: workspaceId === req.user.id
      const isCreator      = note.createdByUserId === req.user.id;
      const isWorkspaceOwner = note.workspaceId === req.user.id;
      if (!isCreator && !isWorkspaceOwner) {
        return res.status(403).json({ error: "You don't have permission to delete this note" });
      }

      await storage.deleteContactNote(noteId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting contact note:", error);
      res.status(500).json({ error: "Failed to delete note" });
    }
  });


  // AI Snapshot — 2-sentence deal summary from conversation history + notes
  app.get("/api/contacts/:id/snapshot", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const contact = await storage.getContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      if (contact.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

      const { conversations: convs } = await storage.getContactWithConversations(req.params.id) || { conversations: [] };
      const notes = await storage.getContactNotes(req.user.id, req.params.id);

      let messageText = "";
      if (convs.length > 0) {
        const msgs = await storage.getMessages(convs[0].id, 40);
        messageText = msgs
          .map((m) => `${m.direction === "inbound" ? "Contact" : "Agent"}: ${m.content || ""}`)
          .filter((l) => l.length > 10)
          .join("\n");
      }

      const noteText = notes.map((n) => n.content).join("\n");
      const hasContent = messageText.length > 0 || noteText.length > 0;

      if (!hasContent) {
        return res.json({ snapshot: null });
      }

      const prompt = [
        `Contact name: ${contact.name}`,
        contact.tag ? `Tag: ${contact.tag}` : "",
        contact.pipelineStage ? `Pipeline stage: ${contact.pipelineStage}` : "",
        noteText ? `Team notes:\n${noteText}` : "",
        messageText ? `Recent conversation:\n${messageText}` : "",
      ].filter(Boolean).join("\n\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a CRM assistant. Given a contact's conversation history and notes, write a 1–2 sentence deal snapshot that helps a salesperson instantly remember who this person is, what they want, and where things stand. Be direct and specific. No fluff.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 120,
        temperature: 0.4,
      });

      const snapshot = completion.choices[0]?.message?.content?.trim() || null;
      res.json({ snapshot });
    } catch (error) {
      console.error("Error generating snapshot:", error);
      res.status(500).json({ error: "Failed to generate snapshot" });
    }
  });

  // Get activity timeline for a contact
  app.get("/api/contacts/:id/timeline", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const contact = await storage.getContact(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      if (contact.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const events = await storage.getActivityEvents(req.params.id, limit);
      res.json(events);
    } catch (error) {
      console.error("Error fetching timeline:", error);
      res.status(500).json({ error: "Failed to fetch timeline" });
    }
  });
}
