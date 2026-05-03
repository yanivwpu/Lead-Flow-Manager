import type { Express } from "express";
import { CHANNELS } from "@shared/schema";
import { storage } from "../storage";
import { channelService } from "../channelService";
import { scheduleHubSpotAutoSync, contactPatchAffectsHubSpot } from "../hubspotAutoSync";
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
      scheduleHubSpotAutoSync(req.user.id, contact.id);
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
      // Coerce date strings → Date objects for timestamp columns
      const body = { ...req.body };
      if (body.followUpDate !== undefined) {
        body.followUpDate = body.followUpDate ? new Date(body.followUpDate) : null;
      }
      const updated = await storage.updateContact(req.params.id, body);

      // Phase 1 + Phase 5: Diff-checked outbound sync to GHL.
      // Phase 3: pipelineStage changes also sync to GHL opportunity.
      // Only fire for fields that actually changed value. This diff check is the
      // primary loop-prevention mechanism — the ghlRoutes.ts webhook path calls
      // storage.updateContact() directly and never reaches this code path, so
      // changes originating from GHL cannot bounce back.
      if (contact.ghlId) {
        const fieldsToSync: import('../ghlSync').GhlContactFields = {};
        if ('name' in req.body && req.body.name !== contact.name)
          fieldsToSync.name = req.body.name;
        if ('email' in req.body && req.body.email !== contact.email)
          fieldsToSync.email = req.body.email;
        if ('phone' in req.body && req.body.phone !== contact.phone)
          fieldsToSync.phone = req.body.phone;
        if ('tag' in req.body && req.body.tag !== contact.tag)
          fieldsToSync.tags = req.body.tag ? [req.body.tag as string] : [];

        if (Object.keys(fieldsToSync).length > 0) {
          import('../ghlSync').then(({ ghlSyncContactFields }) => {
            ghlSyncContactFields(req.user!.id, contact.ghlId!, fieldsToSync).catch(() => {});
          }).catch(() => {});
        }

        // Phase 3: Sync pipelineStage change → GHL opportunity (create or update)
        if (
          'pipelineStage' in req.body &&
          req.body.pipelineStage !== (contact as any).pipelineStage
        ) {
          import('../ghlSync').then(({ ghlSyncPipelineStage }) => {
            ghlSyncPipelineStage(
              req.user!.id,
              contact.id,
              contact.ghlId!,
              req.body.pipelineStage as string,
            ).catch(() => {});
          }).catch(() => {});
        }
      }

      if (contactPatchAffectsHubSpot(body as Record<string, unknown>)) {
        scheduleHubSpotAutoSync(req.user.id, req.params.id);
      }

      res.json(updated);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  /**
   * System score auto-tag (safe mode).
   * - Never overwrites non-system/manual/workflow tags.
   * - Only applies to New/empty or existing system score tags.
   * - Enforces a minimum confidence threshold.
   *
   * This endpoint is intentionally contact-scoped (Unified Inbox) and does not
   * touch pipelineStage. DB schema is unchanged.
   */
  app.post("/api/contacts/:id/system-score-tag", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const contact = await storage.getContact(req.params.id);
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      if (contact.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });

      const bucket = String(req.body?.bucket || "").toLowerCase();
      const score = typeof req.body?.score === "number" ? req.body.score : undefined;
      const confidence = typeof req.body?.confidence === "number" ? req.body.confidence : undefined;

      const SYSTEM_TAGS = ["Hot Lead", "Warm Lead", "Unqualified"] as const;
      const isSystemTag = (t: string | null | undefined) => SYSTEM_TAGS.includes((t || "") as any);
      const isNeutralTag = (t: string | null | undefined) => {
        const v = (t || "").trim();
        return v === "" || v.toLowerCase() === "new";
      };

      const desiredTag =
        bucket === "hot" ? "Hot Lead" :
        bucket === "warm" ? "Warm Lead" :
        bucket === "unqualified" ? "Unqualified" :
        null; // cold → no auto-tag

      const oldTag = (contact as any).tag as string;

      if (!desiredTag) {
        return res.json({ applied: false, skipped: true, reason: "bucket_not_eligible", oldTag, newTag: null });
      }

      if (confidence == null || confidence < 0.75) {
        return res.json({
          applied: false,
          skipped: true,
          reason: "confidence_below_threshold",
          oldTag,
          newTag: null,
          bucket,
          score,
          confidence,
        });
      }

      const eligibleCurrent = isNeutralTag(oldTag) || isSystemTag(oldTag);
      if (!eligibleCurrent) {
        return res.json({
          applied: false,
          skipped: true,
          reason: "current_tag_not_eligible",
          oldTag,
          newTag: null,
          bucket,
          score,
          confidence,
        });
      }

      if ((oldTag || "").trim() === desiredTag) {
        return res.json({
          applied: false,
          skipped: true,
          reason: "already_set",
          oldTag,
          newTag: desiredTag,
          bucket,
          score,
          confidence,
        });
      }

      const updated = await storage.updateContact(contact.id, { tag: desiredTag });
      scheduleHubSpotAutoSync(req.user.id, contact.id);

      console.info("[system-score-tag] applied", {
        contactId: contact.id,
        oldTag,
        newTag: desiredTag,
        bucket,
        score,
        confidence,
        reason: "eligible_and_confident",
      });

      res.json({
        applied: true,
        oldTag,
        newTag: desiredTag,
        bucket,
        score,
        confidence,
        contact: updated,
      });
    } catch (error) {
      console.error("[system-score-tag] error", error);
      res.status(500).json({ error: "Failed to apply system score tag" });
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
      scheduleHubSpotAutoSync(req.user.id, merged.id);
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

      // Validate that the contact actually has an identifier for the requested channel
      // to avoid setting an override that can never be used (e.g. facebook with no facebookId).
      const channelIdField: Record<string, keyof typeof contact> = {
        whatsapp:  'whatsappId',
        instagram: 'instagramId',
        facebook:  'facebookId',
        sms:       'phone',
        telegram:  'telegramId',
      };
      const requiredField = channelIdField[channel];
      if (requiredField && !contact[requiredField]) {
        return res.status(400).json({
          error: `Contact has no ${channel} ID — cannot switch to ${channel} channel`,
        });
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

  // Send message to contact (auto channel selection, or forceChannel from body when set)
  app.post("/api/contacts/:id/send", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { content, contentType, mediaUrl, mediaType, mediaFilename, channel } = req.body;
      if (!content?.trim() && !mediaUrl) {
        return res.status(400).json({ error: "Message must have content or a media attachment" });
      }
      const requested =
        channel !== undefined && channel !== null && String(channel).trim() !== ""
          ? String(channel).trim()
          : undefined;
      if (requested && !(CHANNELS as readonly string[]).includes(requested)) {
        return res.status(400).json({ error: "Invalid channel" });
      }
      if (process.env.NODE_ENV !== "production") {
        const contactRow = await storage.getContact(req.params.id);
        const channelSettingsRows = await storage.getChannelSettings(req.user.id);
        const payloadPreview = typeof content === "string" ? content.slice(0, 200) : "";
        console.log("[api/contacts/send] start", {
          contactId: req.params.id,
          requestedChannel: requested ?? null,
          contentType: contentType || null,
          payloadPreview,
          hasMediaUrl: !!mediaUrl,
          contactFound: !!contactRow,
          contactPrimaryChannel: contactRow?.primaryChannel ?? null,
          contactLastIncomingChannel: contactRow?.lastIncomingChannel ?? null,
          channelSettings: channelSettingsRows.map((s) => ({
            channel: s.channel,
            isConnected: s.isConnected,
            pageId: (s.config as { pageId?: string } | null)?.pageId ?? null,
            phoneNumberId: (s.config as { phoneNumberId?: string } | null)?.phoneNumberId ?? null,
          })),
        });
      }
      const { channelService } = await import("../channelService");
      const result = await channelService.sendMessage({
        userId: req.user.id,
        contactId: req.params.id,
        content: content || '',
        contentType: contentType || mediaType || (mediaUrl ? 'image' : 'text'),
        mediaUrl,
        mediaType,
        mediaFilename,
        forceChannel: requested,
        suppressFallback: !!requested,
        enforceWhatsAppCustomerServiceWindow: true,
      });
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("[api/contacts/send] Error sending message:", {
        contactId: req.params.id,
        userId: req.user?.id,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send message",
      });
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

  // Update (edit) a Team Note
  app.patch("/api/contacts/:id/notes/:noteId", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { noteId } = req.params;
      const { content } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: "Content is required" });

      const note = await storage.getContactNoteById(noteId);
      if (!note) return res.status(404).json({ error: "Note not found" });

      const isCreator = note.createdByUserId === req.user.id;
      const isWorkspaceOwner = note.workspaceId === req.user.id;
      if (!isCreator && !isWorkspaceOwner) {
        return res.status(403).json({ error: "You don't have permission to edit this note" });
      }

      const updated = await storage.updateContactNote(noteId, content.trim());
      res.json(updated);
    } catch (error) {
      console.error("Error updating contact note:", error);
      res.status(500).json({ error: "Failed to update note" });
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

  // ── Appointments ───────────────────────────────────────────────────────────
  app.get("/api/appointments", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const appts = await storage.getAppointmentsByUser(req.user.id);
      res.json(appts);
    } catch (err) {
      console.error("Error fetching appointments:", err);
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.get("/api/contacts/:id/appointments", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const appts = await storage.getAppointmentsByContact(req.user.id, req.params.id);
      res.json(appts);
    } catch (err) {
      console.error("Error fetching contact appointments:", err);
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const { contactId, contactName, appointmentType, appointmentDate, title } = req.body;
      if (!contactId || !appointmentDate) {
        return res.status(400).json({ error: "contactId and appointmentDate are required" });
      }
      const appt = await storage.createAppointment({
        userId: req.user.id,
        contactId,
        contactName: contactName || "",
        appointmentType: appointmentType || "Appointment",
        appointmentDate: new Date(appointmentDate),
        title: title || "",
        status: "scheduled",
      });
      res.json(appt);
    } catch (err) {
      console.error("Error creating appointment:", err);
      res.status(500).json({ error: "Failed to create appointment" });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const ok = await storage.deleteAppointment(req.params.id);
      if (!ok) return res.status(404).json({ error: "Appointment not found" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting appointment:", err);
      res.status(500).json({ error: "Failed to delete appointment" });
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

  app.post("/api/contacts/:id/handoff-resolve", async (req, res) => {
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
      const conversationId = req.body?.conversationId as string | undefined;
      const reason = (req.body?.reason as string) || "user_unsnooze";
      if (!conversationId || typeof conversationId !== "string") {
        return res.status(400).json({ error: "conversationId is required" });
      }
      const conv = await storage.getConversation(conversationId);
      if (!conv || conv.contactId !== contact.id) {
        return res.status(400).json({ error: "Invalid conversation for this contact" });
      }
      await channelService.resolveHandoffIfActive(req.user.id, contact.id, conversationId, reason);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving handoff:", error);
      res.status(500).json({ error: "Failed to resolve handoff" });
    }
  });
}
