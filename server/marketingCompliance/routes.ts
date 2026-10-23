import { requireProspectImportAccess } from "../routes/prospectImportAccess";
import express, { type Express } from "express";
import { sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { escapeMarketingHtml, readOptOutToken, normalizeMarketingEmail, normalizeMarketingPhone, normalizeStoredMarketingPhone, issueOptOutToken, addMarketingFooter, marketingPublicOrigin } from "./policy";
import { suppressMarketingIdentity } from "./store";
import { getEmailMailboxById, listEmailMailboxes } from "../emailChannel/mailboxStore";
import { renderMarketingUnsubscribePage } from "./unsubscribePage";

export function registerMarketingComplianceRoutes(app: Express) {
  const path = "/api/marketing/unsubscribe/:token";
  // Token authentication replaces cookies. GET never mutates; scanners are safe.
  app.get(path, (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" });
    try {
      readOptOutToken(req.params.token);
      const page = renderMarketingUnsubscribePage({ kind: "confirm", actionPath: req.path, acceptLanguage: req.headers["accept-language"] });
      res.set({ "Content-Security-Policy": page.csp, "Content-Language": page.language });
      res.type("html").send(page.html);
    } catch { res.status(400).type("text").send("This unsubscribe link is invalid. Reply to the sender to request an opt-out."); }
  });
  app.post(path, express.urlencoded({ extended: false, limit: "2kb" }), async (req, res) => {
    res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" });
    let identity;
    try { identity = readOptOutToken(req.params.token); }
    catch { return res.status(400).json({ error: "Invalid unsubscribe link" }); }
    if (req.body?.["List-Unsubscribe"] !== "One-Click") return res.status(400).json({ error: "Confirmation required" });
    try {
      // Ignore session, query tenant overrides and redirects entirely.
      await suppressMarketingIdentity({ ...identity, reason: "unsubscribe", source: "one_click", scope: "email" });
      const page = renderMarketingUnsubscribePage({ kind: "success", acceptLanguage: req.headers["accept-language"] });
      res.set({ "Content-Security-Policy": page.csp, "Content-Language": page.language });
      return res.type("html").send(page.html);
    } catch { return res.status(503).json({ error: "Unable to save your opt-out. Please retry or reply to the sender." }); }
  });

  app.get("/api/marketing/queue/:itemId/preview", requireProspectImportAccess, async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const { resolveProspectWorkspaceUserId } = await import("../prospectImport/prospectWorkspaceScope");
      const workspace = await resolveProspectWorkspaceUserId(req.user.id);
      const result = await db.execute(sql`SELECT * FROM prospect_outreach_queue_items WHERE id=${req.params.itemId} AND workspace_user_id=${workspace} LIMIT 1`);
      const item = result.rows[0];
      if (!item) return res.status(404).json({ error: "Draft not found" });
      const { requireMarketingSender } = await import("./service");
      const sender = await requireMarketingSender(workspace, String(item.sender_mailbox_id));
      const { normalizeProspectOutreachEmailText, renderProspectOutreachEmailHtml } = await import("../prospectImport/prospectOutreachEmailHtml");
      const text = normalizeProspectOutreachEmailText(String(item.message_snapshot));
      const token = issueOptOutToken({ workspace, email: String(item.recipient_identity_normalized) });
      const url = `${marketingPublicOrigin()}/api/marketing/unsubscribe/${token}`;
      const rendering = item.link_rendering_snapshot as {campaignLinkUrl?: string; preserveAuthoredUrls?: boolean} | null;
      const campaignLink = rendering?.campaignLinkUrl || "";
      const preserveAuthoredUrls = rendering?.preserveAuthoredUrls !== false;
      const preview = addMarketingFooter({ text, html: renderProspectOutreachEmailHtml(text, [campaignLink], preserveAuthoredUrls), brand: sender.brand, address: sender.postal_address, url });
      return res.json({ ...preview, subject: item.subject_snapshot, sendingDisabled: true });
    } catch { return res.status(409).json({ error: "Recipient preview requires a verified sender address and configured unsubscribe service. Marketing remains blocked." }); }
  });
  app.get("/api/marketing/contacts/:contactId/suppression", async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const { storage } = await import("../storage");
      const contact = await storage.getContact(req.params.contactId);
      if (!contact || contact.userId !== req.user.id) return res.status(404).json({ error: "Contact not found" });
      const keys: string[] = [];
      try { if (contact.email) keys.push(normalizeMarketingEmail(contact.email)); } catch {}
      try { if (contact.phone) keys.push(`phone:${normalizeStoredMarketingPhone(contact.phone)}`); } catch {}
      const result = keys.length ? await db.execute(sql`SELECT scope,reason,source,suppressed_at FROM marketing_suppressions WHERE workspace_user_id=${req.user.id} AND email_normalized IN (${sql.join(keys.map(k => sql`${k}`), sql`,`)})`) : { rows: [] };
      return res.json({ history: result.rows, canSuppress: keys.length > 0 });
    } catch { return res.status(503).json({ error: "Unable to load opt-out history" }); }
  });
  app.post("/api/marketing/contacts/:contactId/dnc", async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const { storage } = await import("../storage");
      const contact = await storage.getContact(req.params.contactId);
      if (!contact || contact.userId !== req.user.id) return res.status(404).json({ error: "Contact not found" });
      let email: string | undefined; let phone: string | undefined;
      try { if (contact.email) email = normalizeMarketingEmail(contact.email); } catch {}
      try { if (contact.phone) phone = normalizeStoredMarketingPhone(contact.phone); } catch {}
      if (!email && !phone) return res.status(400).json({ error: "Add a valid email or international phone number before setting do not contact." });
      await suppressMarketingIdentity({ workspace: req.user.id, email, phone, reason: "dnc", source: "owner_manual", scope: "all" });
      return res.json({ suppressed: true });
    } catch { return res.status(503).json({ error: "Unable to save do-not-contact" }); }
  });
  app.get("/api/marketing/sender-profiles", async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    try {
      const result = await db.execute(sql`SELECT mailbox_id,brand,postal_address,verified_at FROM marketing_sender_profiles WHERE workspace_user_id=${req.user.id}`);
      const mailboxes = (await listEmailMailboxes(req.user.id)).map(m => ({ id: m.id, email: m.emailAddress }));
      return res.json({ profiles: result.rows, mailboxes, sendingDisabled: true });
    } catch { return res.status(503).json({ error: "Marketing sender setup is unavailable" }); }
  });
  app.put("/api/marketing/sender-profiles/:mailboxId", async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ error: "Authentication required" });
    const { brand, postalAddress, verified } = req.body || {};
    if (typeof brand !== "string" || brand.trim().length < 2 || brand.length > 120 || typeof postalAddress !== "string" || postalAddress.trim().length < 10 || postalAddress.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(brand + postalAddress) || verified !== true) {
      return res.status(400).json({ error: "Enter the sender business name and real physical mailing address, then confirm verification." });
    }
    try {
      const mailbox = await getEmailMailboxById(req.params.mailboxId);
      // Deliberately owner-only: an agent cannot attest for an independent sender.
      if (!mailbox || mailbox.workspaceUserId !== req.user.id) return res.status(404).json({ error: "Sender not found" });
      await db.execute(sql`INSERT INTO marketing_sender_profiles (workspace_user_id,mailbox_id,brand,postal_address,verified_at,verified_by)
        VALUES (${req.user.id},${mailbox.id},${brand.trim()},${postalAddress.trim()},now(),${req.user.id})
        ON CONFLICT (workspace_user_id,mailbox_id) DO UPDATE SET brand=EXCLUDED.brand,postal_address=EXCLUDED.postal_address,verified_at=now(),verified_by=EXCLUDED.verified_by`);
      return res.json({ saved: true, sendingDisabled: true });
    } catch { return res.status(503).json({ error: "Sender setup could not be saved" }); }
  });
}
