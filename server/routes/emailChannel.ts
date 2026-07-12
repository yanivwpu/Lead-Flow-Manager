import type { Express, Request, Response } from "express";
import {
  completeGmailOAuth,
  disconnectEmailMailbox,
  getGmailOAuthRedirectUri,
  getWorkspaceEmailStatus,
  startGmailOAuth,
  toPublicMailbox,
} from "../emailChannel/oauth";
import { getPrimaryEmailMailbox, getEmailMailboxById, listEmailMailboxes } from "../emailChannel/mailboxStore";
import { runInitialEmailSync } from "../emailChannel/syncService";
import { getEmailMessageDetail } from "../emailChannel/mailboxStore";
import { assertEmailEncryptionConfigured } from "../emailChannel/credentials";
import { GMAIL_OAUTH_SCOPES } from "@shared/emailChannel";

function requireAuth(req: Request, res: Response): req is Request & { user: { id: string } } {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerEmailChannelRoutes(app: Express): void {
  app.get("/api/integrations/email/status", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const status = await getWorkspaceEmailStatus(req.user.id);
      res.json({
        ...status,
        scopes: GMAIL_OAUTH_SCOPES,
        redirectUri: getGmailOAuthRedirectUri(),
        phase: "1A",
        oneMailboxPerWorkspace: true,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load email status" });
    }
  });

  app.get("/api/integrations/email/gmail/auth-url", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      assertEmailEncryptionConfigured();
      const { url } = await startGmailOAuth({
        workspaceUserId: req.user.id,
        connectedByUserId: req.user.id,
      });
      res.json({ url });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Failed to start Gmail OAuth" });
    }
  });

  app.get("/api/integrations/email/gmail/callback", async (req, res) => {
    const appUrl = String(process.env.APP_URL || "https://app.whachatcrm.com").replace(/\/+$/, "");
    const settingsUrl = `${appUrl}/app/settings?section=channels&provider=email`;
    try {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const oauthError = typeof req.query.error === "string" ? req.query.error : "";
      if (oauthError) {
        return res.redirect(`${settingsUrl}&emailError=${encodeURIComponent(oauthError)}`);
      }
      if (!code || !state) {
        return res.redirect(`${settingsUrl}&emailError=${encodeURIComponent("missing_code_or_state")}`);
      }
      const result = await completeGmailOAuth({ code, state });
      return res.redirect(
        `${settingsUrl}&emailConnected=1&mailbox=${encodeURIComponent(result.emailAddress)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "oauth_failed";
      return res.redirect(`${settingsUrl}&emailError=${encodeURIComponent(msg)}`);
    }
  });

  app.post("/api/integrations/email/disconnect", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const mailboxId =
        typeof req.body?.mailboxId === "string"
          ? req.body.mailboxId
          : (await getPrimaryEmailMailbox(req.user.id))?.id;
      if (!mailboxId) return res.status(404).json({ error: "No mailbox connected" });
      await disconnectEmailMailbox({ workspaceUserId: req.user.id, mailboxId });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Disconnect failed" });
    }
  });

  app.post("/api/integrations/email/sync", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const mailbox = await getPrimaryEmailMailbox(req.user.id);
      if (!mailbox) return res.status(404).json({ error: "No mailbox connected" });
      void runInitialEmailSync(mailbox.id);
      res.status(202).json({ ok: true, mailboxId: mailbox.id, status: "syncing" });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Sync failed" });
    }
  });

  app.get("/api/integrations/email/mailboxes", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const rows = await listEmailMailboxes(req.user.id);
      res.json({ mailboxes: rows.map(toPublicMailbox) });
    } catch (err) {
      res.status(500).json({ error: "Failed to list mailboxes" });
    }
  });

  app.get("/api/messages/:messageId/email-details", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const detail = await getEmailMessageDetail(req.params.messageId);
      if (!detail) return res.status(404).json({ error: "Not found" });
      // Ownership: message must belong to workspace
      const msg = await storageGetMessage(req.params.messageId);
      if (!msg || msg.userId !== req.user.id) return res.status(403).json({ error: "Forbidden" });
      res.json({ detail });
    } catch (err) {
      res.status(500).json({ error: "Failed to load email details" });
    }
  });
}

async function storageGetMessage(id: string) {
  const { storage } = await import("../storage");
  // storage may not expose getMessage by id — use db via detail join already validated lightly
  const { db } = await import("../../drizzle/db");
  const { messages } = await import("@shared/schema");
  const { eq } = await import("drizzle-orm");
  const rows = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return rows[0];
}
