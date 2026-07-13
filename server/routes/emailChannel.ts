import type { Express, Request, Response } from "express";
import {
  completeGmailOAuth,
  disconnectEmailMailbox,
  getGmailOAuthRedirectUri,
  getWorkspaceEmailStatus,
  startGmailOAuth,
  toPublicMailbox,
  toGmailOAuthRedirectError,
} from "../emailChannel/oauth";
import { getPrimaryEmailMailbox, getEmailMailboxById, listEmailMailboxes } from "../emailChannel/mailboxStore";
import { runInitialEmailSync } from "../emailChannel/syncService";
import { getEmailMessageDetail } from "../emailChannel/mailboxStore";
import { assertEmailEncryptionConfigured } from "../emailChannel/credentials";
import { GMAIL_OAUTH_SCOPES } from "@shared/emailChannel";
import { logGmailOAuthDiag, logGmailOAuthDiagStartupReady } from "../emailChannel/gmailOAuthDiagnostic";

function requireAuth(req: Request, res: Response): req is Request & { user: { id: string } } {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerEmailChannelRoutes(app: Express): void {
  console.error("[EmailRouteBootProbe] entered_register");
  app.get("/api/integrations/email/status", async (req, res) => {
    try {
      if (!requireAuth(req, res)) return;
      const status = await getWorkspaceEmailStatus(req.user.id);
      res.json({
        ...status,
        scopes: GMAIL_OAUTH_SCOPES,
        redirectUri: getGmailOAuthRedirectUri(),
        phase: "1B",
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

      logGmailOAuthDiag("callback_received", {
        hasCode: !!code,
        hasState: !!state,
        oauthError: oauthError || null,
      });

      if (oauthError) {
        logGmailOAuthDiag("callback_failed", { category: "oauth_failed", oauthError });
        return res.redirect(
          `${settingsUrl}&emailError=${encodeURIComponent("oauth_failed")}&emailErrorMsg=${encodeURIComponent(oauthError)}`,
        );
      }
      if (!code || !state) {
        logGmailOAuthDiag("callback_failed", {
          category: "oauth_failed",
          reason: "missing_code_or_state",
        });
        return res.redirect(
          `${settingsUrl}&emailError=${encodeURIComponent("oauth_failed")}&emailErrorMsg=${encodeURIComponent("missing_code_or_state")}`,
        );
      }
      const result = await completeGmailOAuth({ code, state });
      return res.redirect(
        `${settingsUrl}&emailConnected=1&mailbox=${encodeURIComponent(result.emailAddress)}`,
      );
    } catch (err) {
      const { category, uiMessage } = toGmailOAuthRedirectError(err);
      logGmailOAuthDiag("callback_failed", {
        category,
        message: err instanceof Error ? err.message.slice(0, 200) : "oauth_failed",
        httpStatus:
          err instanceof Error && "httpStatus" in err ? (err as { httpStatus?: number }).httpStatus : null,
        googleErrorCode:
          err instanceof Error && "googleErrorCode" in err
            ? (err as { googleErrorCode?: string | number | null }).googleErrorCode
            : null,
        googleErrorMessage:
          err instanceof Error && "googleErrorMessage" in err
            ? String((err as { googleErrorMessage?: string | null }).googleErrorMessage || "").slice(0, 400)
            : null,
      });
      return res.redirect(
        `${settingsUrl}&emailError=${encodeURIComponent(category)}&emailErrorMsg=${encodeURIComponent(uiMessage)}`,
      );
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

  logGmailOAuthDiagStartupReady();
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
