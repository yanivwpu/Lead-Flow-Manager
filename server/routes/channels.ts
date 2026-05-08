import type { Express } from "express";
import { storage } from "../storage";
import {
  getWhatsAppAvailability,
  syncWhatsAppChannelRowFromCanonicalMeta,
  isCanonicalWhatsAppFullyConnected,
  logWhatsAppChannelState,
  type WhatsAppProvider,
} from "../whatsappService";
import { db } from "../../drizzle/db";
import { channelSettings, messages as messagesTable } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { getMetaGraphApiBase } from "../metaGraphVersion";

export function registerChannelRoutes(app: Express): void {
  function truncateJson(v: unknown, max = 12_000): string {
    try {
      const s = JSON.stringify(v);
      return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
    } catch {
      return "[unserializable]";
    }
  }

  function asId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s.length ? s : null;
  }

  async function debugTokenSummary(inputToken: string): Promise<{
    ok: boolean;
    httpStatus: number | null;
    app_id: string | null;
    type: string | null;
    is_valid: boolean | null;
    scopes: string[] | null;
    granular_scopes: unknown[] | null;
    error: unknown | null;
  }> {
    const appId = process.env.META_APP_ID?.trim();
    const appSecret = process.env.META_APP_SECRET?.trim();
    if (!appId || !appSecret) {
      return {
        ok: false,
        httpStatus: null,
        app_id: null,
        type: null,
        is_valid: null,
        scopes: null,
        granular_scopes: null,
        error: { message: "META_APP_ID/META_APP_SECRET unset" },
      };
    }
    const base = getMetaGraphApiBase();
    const url =
      `${base}/debug_token` +
      `?input_token=${encodeURIComponent(inputToken)}` +
      `&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const j = (await r.json().catch(() => ({}))) as any;
      const d = j?.data ?? {};
      return {
        ok: r.ok && !j?.error && d?.is_valid !== false,
        httpStatus: r.status,
        app_id: asId(d?.app_id),
        type: typeof d?.type === "string" ? d.type : null,
        is_valid: typeof d?.is_valid === "boolean" ? d.is_valid : null,
        scopes: Array.isArray(d?.scopes) ? d.scopes.map(String) : null,
        granular_scopes: Array.isArray(d?.granular_scopes) ? d.granular_scopes : null,
        error: j?.error ?? null,
      };
    } catch (e: any) {
      return {
        ok: false,
        httpStatus: null,
        app_id: null,
        type: null,
        is_valid: null,
        scopes: null,
        granular_scopes: null,
        error: { message: e?.message || String(e) },
      };
    }
  }

  /**
   * Instagram diagnostics for inbound IG DMs (webhooks + Graph permissions).
   * Uses the saved Page/IG credentials from channelSettings.config (no secrets returned; token never logged).
   */
  app.get("/api/integrations/instagram/diagnostics", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const [row] = await db
        .select()
        .from(channelSettings)
        .where(and(eq(channelSettings.userId, req.user.id), eq(channelSettings.channel, "instagram")));

      const cfg = (row?.config as any) ?? {};
      const igIdSaved =
        asId(cfg.instagramAccountId ?? cfg.instagramId ?? cfg.instagram_id) ??
        null;
      const pageIdSaved = asId(cfg.pageId ?? cfg.page_id) ?? null;
      const pageAccessToken = typeof (cfg.accessToken ?? cfg.pageAccessToken ?? cfg.page_access_token) === "string"
        ? (cfg.accessToken ?? cfg.pageAccessToken ?? cfg.page_access_token)
        : null;

      const saved = {
        igIdSaved,
        pageIdSaved,
        pageAccessTokenExists: !!pageAccessToken,
        instagramConnected: !!row?.isConnected,
        integrationStatus:
          typeof cfg.integrationStatus === "string"
            ? cfg.integrationStatus
            : typeof cfg.status === "string"
              ? cfg.status
              : row?.isConnected
                ? "connected"
                : "not_connected",
      };

      if (!row) {
        return res.status(404).json({
          error: "No Instagram channel setting found for this workspace.",
          saved,
        });
      }
      if (!pageAccessToken) {
        return res.status(400).json({
          error: "Instagram is connected but page access token is missing in saved config.",
          saved,
        });
      }

      const dbg = await debugTokenSummary(pageAccessToken);
      const tokenHasInstagramManageMessages = Array.isArray(dbg.scopes)
        ? dbg.scopes.includes("instagram_manage_messages")
        : false;

      const base = getMetaGraphApiBase();

      // 3) Page → IG linkage
      let pageLink: { ok: boolean; httpStatus: number | null; body: any; error: any | null } = {
        ok: false,
        httpStatus: null,
        body: null,
        error: null,
      };
      if (pageIdSaved) {
        const url =
          `${base}/${encodeURIComponent(pageIdSaved)}` +
          `?fields=${encodeURIComponent("instagram_business_account,connected_instagram_account")}` +
          `&access_token=${encodeURIComponent(pageAccessToken)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const j = (await r.json().catch(() => ({}))) as any;
        pageLink = {
          ok: r.ok && !j?.error,
          httpStatus: r.status,
          body: j,
          error: j?.error ?? null,
        };
      }

      const igIdFromPage =
        asId(pageLink.body?.instagram_business_account?.id) ??
        asId(pageLink.body?.connected_instagram_account?.id) ??
        null;
      const igId = igIdSaved ?? igIdFromPage;

      const pageLinkedToIg =
        !!(igIdFromPage && igIdSaved)
          ? igIdFromPage === igIdSaved
          : !!igIdFromPage;

      // 4) IG profile + conversations
      let igProfile: { ok: boolean; httpStatus: number | null; body: any; error: any | null } = {
        ok: false,
        httpStatus: null,
        body: null,
        error: null,
      };
      let igConversations: { ok: boolean; httpStatus: number | null; body: any; error: any | null } = {
        ok: false,
        httpStatus: null,
        body: null,
        error: null,
      };

      if (igId) {
        const profUrl =
          `${base}/${encodeURIComponent(igId)}` +
          `?fields=${encodeURIComponent("id,username,name")}` +
          `&access_token=${encodeURIComponent(pageAccessToken)}`;
        const pr = await fetch(profUrl, { signal: AbortSignal.timeout(10_000) });
        const pj = (await pr.json().catch(() => ({}))) as any;
        igProfile = { ok: pr.ok && !pj?.error, httpStatus: pr.status, body: pj, error: pj?.error ?? null };

        const convUrl =
          `${base}/${encodeURIComponent(igId)}/conversations` +
          `?fields=${encodeURIComponent("id,updated_time")}` +
          `&limit=5&access_token=${encodeURIComponent(pageAccessToken)}`;
        const cr = await fetch(convUrl, { signal: AbortSignal.timeout(10_000) });
        const cj = (await cr.json().catch(() => ({}))) as any;
        igConversations = { ok: cr.ok && !cj?.error, httpStatus: cr.status, body: cj, error: cj?.error ?? null };
      }

      const graphCanReadIgProfile = igProfile.ok;
      const graphCanReadIgConversations = igConversations.ok;

      // 5) Webhook subscription checks (best-effort)
      let pageSubscribedApps: { ok: boolean; httpStatus: number | null; body: any; error: any | null; appPresent: boolean } =
        { ok: false, httpStatus: null, body: null, error: null, appPresent: false };
      if (pageIdSaved) {
        const subUrl =
          `${base}/${encodeURIComponent(pageIdSaved)}/subscribed_apps` +
          `?access_token=${encodeURIComponent(pageAccessToken)}`;
        const sr = await fetch(subUrl, { signal: AbortSignal.timeout(10_000) });
        const sj = (await sr.json().catch(() => ({}))) as any;
        const rows = Array.isArray(sj?.data) ? sj.data : [];
        const ids = rows.map((r: any) => String(r?.id ?? "").trim()).filter(Boolean);
        const appId = (process.env.META_APP_ID || "").trim();
        const appPresent = !!(appId && ids.includes(appId));
        pageSubscribedApps = { ok: sr.ok && !sj?.error, httpStatus: sr.status, body: sj, error: sj?.error ?? null, appPresent };
      }

      // 6) Blocker reasoning (A-E)
      let blockerReason = "";
      const graphErrCode =
        (igConversations.error?.code as number | undefined) ??
        (igProfile.error?.code as number | undefined) ??
        (pageLink.error?.code as number | undefined);

      if (!pageIdSaved) {
        blockerReason = "Saved integration is missing linked Facebook Page ID.";
      } else if (!igId) {
        blockerReason = "A) Instagram account is not linked to the saved Facebook Page (no IG id found via Page fields).";
      } else if (!pageLinkedToIg) {
        blockerReason = "A) Saved IG account does not match the IG linked to this Page.";
      } else if (!tokenHasInstagramManageMessages) {
        blockerReason = "B) Token is missing instagram_manage_messages (reconnect with correct permissions).";
      } else if (graphErrCode === 3) {
        blockerReason = "C) Graph returned (#3) capability/permission blocked. App mode/review/IG product configuration may be required.";
      } else if (pageSubscribedApps.ok && !pageSubscribedApps.appPresent) {
        blockerReason = "D) Page is not subscribed to this app (GET /{page-id}/subscribed_apps missing META_APP_ID).";
      } else if (!graphCanReadIgConversations) {
        blockerReason = "Graph cannot read IG conversations; check permissions/app mode and IG being a professional account.";
      } else {
        blockerReason =
          "E) Webhook may not be reaching the app, or routing/resolution is failing after receipt. Check /api/webhook/meta logs for instagram object deliveries.";
      }

      const result = {
        saved,
        debugToken: {
          app_id: dbg.app_id,
          type: dbg.type,
          is_valid: dbg.is_valid,
          scopes: dbg.scopes,
          granular_scopes: dbg.granular_scopes,
          httpStatus: dbg.httpStatus,
          ok: dbg.ok,
          error: dbg.error,
        },
        pageToIg: {
          pageId: pageIdSaved,
          httpOk: pageLink.ok,
          httpStatus: pageLink.httpStatus,
          raw: pageLink.body,
          error: pageLink.error,
        },
        igProfile: {
          igId,
          httpOk: igProfile.ok,
          httpStatus: igProfile.httpStatus,
          raw: igProfile.body,
          error: igProfile.error,
        },
        igConversations: {
          igId,
          httpOk: igConversations.ok,
          httpStatus: igConversations.httpStatus,
          raw: igConversations.body,
          error: igConversations.error,
        },
        webhookSubscription: {
          pageSubscribedAppsOk: pageSubscribedApps.ok,
          pageSubscribedAppsHttpStatus: pageSubscribedApps.httpStatus,
          appPresentOnPage: pageSubscribedApps.appPresent,
          raw: pageSubscribedApps.body,
          error: pageSubscribedApps.error,
        },
        // Flat booleans for UI / support
        igId,
        pageId: pageIdSaved,
        pageLinkedToIg,
        tokenHasInstagramManageMessages,
        graphCanReadIgProfile,
        graphCanReadIgConversations,
        blockerReason,
      };

      console.log(
        `[InstagramDiagnostics] ${JSON.stringify({
          userId: req.user.id,
          igId,
          pageId: pageIdSaved,
          pageLinkedToIg,
          tokenHasInstagramManageMessages,
          graphCanReadIgProfile,
          graphCanReadIgConversations,
          pageSubscribedAppsOk: pageSubscribedApps.ok,
          appPresentOnPage: pageSubscribedApps.appPresent,
          graphErrorCodes: {
            pageLink: pageLink.error?.code ?? null,
            igProfile: igProfile.error?.code ?? null,
            igConversations: igConversations.error?.code ?? null,
          },
          debug: {
            ok: dbg.ok,
            is_valid: dbg.is_valid,
            app_id: dbg.app_id,
            type: dbg.type,
            scopes: dbg.scopes,
            granular_scopes_count: Array.isArray(dbg.granular_scopes) ? dbg.granular_scopes.length : null,
          },
          rawTruncated: {
            pageLink: truncateJson(pageLink.body, 4000),
            igProfile: truncateJson(igProfile.body, 4000),
            igConversations: truncateJson(igConversations.body, 4000),
            pageSubscribedApps: truncateJson(pageSubscribedApps.body, 4000),
          },
          blockerReason,
        })}`
      );

      return res.json(result);
    } catch (e: any) {
      console.error("[InstagramDiagnostics] error", e?.message || e);
      return res.status(500).json({ error: e?.message || "Instagram diagnostics failed" });
    }
  });

  /** Activation onboarding: channel connection + first outbound message (for checklist UI). */
  app.get("/api/activation-status", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUserForSession(req.user.id);
      const legacyRowBefore = await storage.getChannelSetting(req.user.id, "whatsapp");
      const legacyChannelConnected = !!legacyRowBefore?.isConnected;
      await syncWhatsAppChannelRowFromCanonicalMeta(req.user.id);
      const settings = await storage.getChannelSettings(req.user.id);
      const legacyAfterSync = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
      const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
      const whatsappConnected = canonicalWa || legacyAfterSync;
      if (user) {
        const activeProvider = (user.whatsappProvider as WhatsAppProvider) || "twilio";
        logWhatsAppChannelState({
          userId: req.user.id,
          activeProvider,
          metaConnected: !!user.metaConnected,
          webhookSubscribed: !!user.metaWebhookSubscribed,
          legacyChannelConnected,
          finalConnected: whatsappConnected,
        });
      }
      const instagramConnected = settings.some((s) => s.channel === "instagram" && !!s.isConnected);
      const facebookConnected = settings.some((s) => s.channel === "facebook" && !!s.isConnected);
      const metaConnected = instagramConnected || facebookConnected;
      const hasAnyMessagingChannel = whatsappConnected || metaConnected;

      const [outbound] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(eq(messagesTable.userId, req.user.id), eq(messagesTable.direction, "outbound")),
        )
        .limit(1);

      const hasSentFirstMessage = !!outbound;

      res.json({
        whatsappConnected,
        instagramConnected,
        facebookConnected,
        metaConnected,
        hasAnyMessagingChannel,
        hasSentFirstMessage,
        checklistComplete:
          whatsappConnected && metaConnected && hasSentFirstMessage,
      });
    } catch (error) {
      console.error("Error fetching activation status:", error);
      res.status(500).json({ error: "Failed to fetch activation status" });
    }
  });

  // Get all channel settings
  app.get("/api/channels", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const user = await storage.getUserForSession(req.user.id);
      const legacyRowBefore = await storage.getChannelSetting(req.user.id, "whatsapp");
      const legacyChannelConnected = !!legacyRowBefore?.isConnected;
      await syncWhatsAppChannelRowFromCanonicalMeta(req.user.id);
      const settings = await storage.getChannelSettings(req.user.id);
      const legacyAfterSync = settings.some((s) => s.channel === "whatsapp" && !!s.isConnected);
      const canonicalWa = user ? isCanonicalWhatsAppFullyConnected(user) : false;
      const finalConnected = canonicalWa || legacyAfterSync;
      if (user) {
        const activeProvider = (user.whatsappProvider as WhatsAppProvider) || "twilio";
        logWhatsAppChannelState({
          userId: req.user.id,
          activeProvider,
          metaConnected: !!user.metaConnected,
          webhookSubscribed: !!user.metaWebhookSubscribed,
          legacyChannelConnected,
          finalConnected,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching channel settings:", error);
      res.status(500).json({ error: "Failed to fetch channel settings" });
    }
  });

  // Check WhatsApp availability — must be BEFORE /:channel
  app.get("/api/channels/whatsapp/availability", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const result = await getWhatsAppAvailability(req.user.id);
      res.json(result);
    } catch (error) {
      console.error("Error checking WhatsApp availability:", error);
      res.status(500).json({
        available: false,
        reason: "Failed to check availability",
        message: "Please try again or contact support",
      });
    }
  });

  // Update a channel setting
  app.patch("/api/channels/:channel", async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const { CHANNELS } = await import("@shared/schema");
      const channel = req.params.channel;
      if (!CHANNELS.includes(channel as any)) {
        return res.status(400).json({ error: "Invalid channel" });
      }
      const setting = await storage.upsertChannelSetting(
        req.user.id,
        channel as any,
        req.body
      );
      res.json(setting);
    } catch (error) {
      console.error("Error updating channel setting:", error);
      res.status(500).json({ error: "Failed to update channel setting" });
    }
  });
}
