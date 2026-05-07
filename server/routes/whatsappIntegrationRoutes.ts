/**
 * WhatsApp integration: Meta Embedded Signup + unified status API.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  getWhatsappMetaPublicConfig,
  startEmbeddedSignupSession,
  completeEmbeddedSignupOAuth,
  finalizeEmbeddedSignupWabaSelection,
  getWhatsappMetaRedirectUri,
  logWhatsappEmbeddedSignupStartupWarnings,
  applyMetaTokenExpiryAttention,
  getWhatsappConnectionDebug,
  verifyWhatsappEmbeddedSignupMigration,
  recordWhatsappMetaRedirectCallbackDebug,
  repairMetaWabaWebhookSubscription,
  refreshWhatsappPhoneGraphDebugIfStale,
  buildWhatsAppInboundRoutingDiagnostics,
} from "../whatsappEmbeddedSignup";
import { getAppOrigin } from "../urlOrigins";
import { storage } from "../storage";
import { classifyMetaWhatsAppPhone } from "../metaWhatsAppPhoneKind";
import { disconnectWhatsAppProvider, getProviderStatus } from "../whatsappService";
import { db } from "../../drizzle/db";
import { whatsappOauthStates } from "@shared/schema";
import { eq } from "drizzle-orm";

export function registerWhatsappIntegrationRoutes(app: Express): void {
  logWhatsappEmbeddedSignupStartupWarnings();
  void verifyWhatsappEmbeddedSignupMigration().then((ok) => {
    if (ok) {
      console.log("[WhatsApp Embedded Signup] Migration check: whatsapp_oauth_states table is reachable.");
    }
  });

  app.get("/api/integrations/whatsapp/meta/config", (_req: Request, res: Response) => {
    try {
      const cfg = getWhatsappMetaPublicConfig();
      res.json(cfg);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to load Meta configuration" });
    }
  });

  const startBody = z.object({
    flow: z.enum(["embedded", "coexistence"]),
  });

  // OLD SDK START (TEMP BLOCK): legacy clients used POST /meta/start then JS SDK.
  // We now use full redirect only: GET /meta/start-redirect.
  app.post("/api/integrations/whatsapp/meta/start", async (req: Request, res: Response) => {
    console.warn("[OLD WHATSAPP SDK FLOW BLOCKED]", { endpoint: "POST /api/integrations/whatsapp/meta/start" });
    return res.status(410).json({
      error: "Old WhatsApp SDK flow disabled. Refresh and use full redirect.",
    });
  });

  app.post("/api/integrations/whatsapp/meta/start__disabled", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = startBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const session = await startEmbeddedSignupSession(req.user.id, parsed.data.flow);
      res.json(session);
    } catch (e: any) {
      console.warn("[WhatsApp Integration] start failed", e?.message || e);
      res.status(400).json({
        error: e?.message || "Could not start Meta signup",
      });
    }
  });

  /** OAuth redirect target — Meta sends GET with ?code=&state= */
  app.get("/api/integrations/whatsapp/meta/callback", async (req: Request, res: Response) => {
    const q = req.query;
    const codeStr = typeof q.code === "string" ? q.code : "";
    const stateStr = typeof q.state === "string" ? q.state : "";
    const errStr = typeof q.error === "string" ? q.error : "";
    const errReason = typeof q.error_reason === "string" ? q.error_reason : "";
    const errDesc = typeof q.error_description === "string" ? q.error_description : "";
    console.log("[WHATSAPP META CALLBACK HIT]", {
      hasCode: codeStr.length > 0,
      hasState: stateStr.length > 0,
      error: errStr || undefined,
      error_reason: errReason || undefined,
      error_description: errDesc ? `[${errDesc.length} chars]` : undefined,
    });

    const base = getAppOrigin().replace(/\/+$/, "");
    const failRedirect = (msg: string) => {
      const q = new URLSearchParams({
        section: "channels",
        whatsapp_embedded: "error",
        reason: msg.slice(0, 300),
      });
      res.redirect(302, `${base}/app/settings?${q.toString()}`);
    };
    const okRedirect = () => {
      res.redirect(
        302,
        `${base}/app/settings?section=channels&whatsapp_embedded=success`
      );
    };

    try {
      const code = codeStr;
      const state = stateStr;
      const error = errStr;
      const errorDescription = errDesc;

      const flatQuery: Record<string, string | undefined> = {};
      for (const [k, raw] of Object.entries(req.query)) {
        if (Array.isArray(raw)) {
          flatQuery[k] = typeof raw[0] === "string" ? raw[0] : undefined;
        } else if (typeof raw === "string") {
          flatQuery[k] = raw;
        } else {
          flatQuery[k] = undefined;
        }
      }
      void recordWhatsappMetaRedirectCallbackDebug({ state, query: flatQuery });

      if (error) {
        console.warn("[WhatsApp Embedded Signup] OAuth error from Meta", { error, errorDescription });
        return failRedirect(errorDescription || error || "Meta returned an error during signup.");
      }
      if (!code || !state) {
        return failRedirect("Missing authorization code. Please try connecting again.");
      }

      /** When absent (browser session not restored on redirect), completion still keys off `whatsapp_oauth_states.userId`. */
      const initiatingUserId = (req as any).user?.id as string | undefined;
      const result = await completeEmbeddedSignupOAuth({
        code,
        state,
        initiatingUserId,
        tokenExchange: "redirect",
      });
      if (!result.success) {
        return failRedirect(result.error);
      }
      if ("needsWabaPick" in result && result.needsWabaPick) {
        const pickUrl = `${base}/app/settings?section=channels&whatsapp_embedded=pick&state=${encodeURIComponent(state)}`;
        return res.redirect(302, pickUrl);
      }
      okRedirect();
    } catch (e: any) {
      console.warn("[WhatsApp Integration] callback exception", e?.message || e);
      failRedirect("Something went wrong while finishing WhatsApp setup. Please try again.");
    }
  });

  const completeSdkBody = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
  });

  /**
   * Embedded Signup v4: exchange `authResponse.code` from FB.login within ~30s (JSON).
   * Same server logic as the redirect callback; ties completion to the logged-in user.
   */
  app.post("/api/integrations/whatsapp/meta/complete-sdk", async (req: Request, res: Response) => {
    console.warn("[OLD WHATSAPP SDK FLOW BLOCKED]", { endpoint: "POST /api/integrations/whatsapp/meta/complete-sdk" });
    return res.status(410).json({
      error: "Old WhatsApp SDK flow disabled. Refresh and use full redirect.",
    });
  });

  app.post("/api/integrations/whatsapp/meta/complete-sdk__disabled", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = completeSdkBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      // Log the exact redirect URI we intend to use (must match the one used to mint the code).
      // Do NOT log the code, token, or any secrets.
      const stateRow = await db
        .select({ redirectUri: whatsappOauthStates.redirectUri })
        .from(whatsappOauthStates)
        .where(eq(whatsappOauthStates.stateToken, parsed.data.state))
        .limit(1);
      console.log("[WhatsApp Embedded Signup] complete-sdk request", {
        tokenExchange: "sdk",
        graphApiVersion: process.env.META_GRAPH_API_VERSION || "v21.0",
        redirectUriUsed: stateRow[0]?.redirectUri || "(missing_on_state_row)",
      });
      const result = await completeEmbeddedSignupOAuth({
        ...parsed.data,
        initiatingUserId: req.user.id,
        tokenExchange: "sdk",
      });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      if ("needsWabaPick" in result && result.needsWabaPick) {
        return res.json({ success: true, needsWabaPick: true, state: result.state });
      }
      res.json({ success: true });
    } catch (e: any) {
      console.warn("[WhatsApp Integration] complete-sdk failed", e?.message || e);
      res.status(500).json({ error: "Complete signup failed" });
    }
  });

  const chooseWabaBody = z.object({
    state: z.string().min(1),
    wabaId: z.string().min(1),
    phoneNumberId: z.string().min(1),
  });

  app.post("/api/integrations/whatsapp/meta/choose-waba", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const parsed = chooseWabaBody.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const result = await finalizeEmbeddedSignupWabaSelection({
        ...parsed.data,
        initiatingUserId: req.user.id,
      });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Could not finalize selection" });
    }
  });

  /**
   * Redirect flow: when multiple valid WABAs exist, callback redirects to Settings with whatsapp_embedded=pick&state=...
   * This endpoint returns the pending choices for the given state (no tokens).
   */
  app.get("/api/integrations/whatsapp/meta/pending-waba", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!state) return res.status(400).json({ error: "Missing state" });
      const rows = await db
        .select({
          userId: whatsappOauthStates.userId,
          expiresAt: whatsappOauthStates.expiresAt,
          choices: whatsappOauthStates.pendingWabaChoices,
        })
        .from(whatsappOauthStates)
        .where(eq(whatsappOauthStates.stateToken, state))
        .limit(1);
      const row = rows[0];
      if (!row || row.expiresAt < new Date()) {
        return res.status(404).json({ error: "No pending selection found. Start again." });
      }
      if (row.userId !== req.user.id) {
        return res.status(403).json({ error: "Forbidden" });
      }
      const choices = Array.isArray(row.choices) ? row.choices : [];
      res.json({ state, choices });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load pending choices" });
    }
  });

  /**
   * Full redirect OAuth entrypoint (production).
   * Creates oauth state, stores redirect_uri, builds Meta dialog URL, and redirects.
   */
  app.get("/api/integrations/whatsapp/meta/start-redirect", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const flow = (req.query.flow === "coexistence" ? "coexistence" : "embedded") as "embedded" | "coexistence";
      const session = await startEmbeddedSignupSession(req.user.id, flow);
      console.log("[WHATSAPP FULL REDIRECT START]", {
        flow,
        redirectUriUsed: session.redirectUri,
        graphApiVersion: session.sdk.graphApiVersion,
      });
      res.redirect(302, session.authUrl);
    } catch (e: any) {
      res.status(400).send(e?.message || "Could not start Meta redirect");
    }
  });

  // Backwards-compatible alias during rollout (safe to remove later).
  app.get("/api/integrations/whatsapp/meta/test-full-redirect", async (req: Request, res: Response) => {
    const qs = new URLSearchParams();
    if (typeof req.query.flow === "string") qs.set("flow", req.query.flow);
    res.redirect(302, `/api/integrations/whatsapp/meta/start-redirect?${qs.toString()}`);
  });

  /** Safe diagnostics for support — no secrets or tokens. */
  app.get("/api/integrations/whatsapp/debug", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const row = await getWhatsappConnectionDebug(req.user.id);
      if (!row) return res.status(404).json({ error: "User not found" });
      res.json(row);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to load debug info" });
    }
  });

  /** Temporary: show saved WhatsApp Meta fields (no tokens). */
  app.get("/api/integrations/whatsapp/meta/debug-saved", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUserForSession(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({
        metaConnected: !!user.metaConnected,
        whatsappProvider: user.whatsappProvider,
        wabaId: user.metaBusinessAccountId ?? null,
        phoneNumberId: user.metaPhoneNumberId ?? null,
        connectionType: user.metaConnectionType ?? null,
        integrationStatus: user.metaIntegrationStatus ?? null,
        tokenExpiresAt: user.metaTokenExpiresAt ?? null,
        webhookSubscribed: user.metaWebhookSubscribed ?? false,
        webhookLastCheckedAt: user.metaWebhookLastCheckedAt ?? null,
        lastErrorCode: user.metaLastErrorCode ?? null,
        lastErrorMessage: user.metaLastErrorMessage ?? null,
        lastOAuthDebug:
          user.metaLastOAuthDebug && typeof user.metaLastOAuthDebug === "object"
            ? user.metaLastOAuthDebug
            : null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Failed to load saved Meta WhatsApp fields" });
    }
  });

  app.get("/api/integrations/whatsapp/status", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      await applyMetaTokenExpiryAttention(req.user.id);
      await refreshWhatsappPhoneGraphDebugIfStale(req.user.id);
      const userAfter = await storage.getUserForSession(req.user.id);
      if (!userAfter) return res.status(404).json({ error: "User not found" });

      const base = await getProviderStatus(req.user.id);
      const coexistenceCfg = getWhatsappMetaPublicConfig();
      const oauthDbg =
        userAfter.metaLastOAuthDebug && typeof userAfter.metaLastOAuthDebug === "object"
          ? (userAfter.metaLastOAuthDebug as Record<string, unknown>)
          : null;
      const phoneGraphSnapshot =
        oauthDbg?.phoneGraphSnapshot && typeof oauthDbg.phoneGraphSnapshot === "object"
          ? (oauthDbg.phoneGraphSnapshot as Record<string, unknown>)
          : null;

      const webhookBaseUrl =
        process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

      let webhookLikelyOk = true;
      if (userAfter.metaConnected && userAfter.whatsappProvider === "meta") {
        webhookLikelyOk = !!(process.env.META_APP_SECRET || userAfter.metaAppSecret);
      }

      const connectedPhoneClassification = classifyMetaWhatsAppPhone({
        displayPhoneNumber: userAfter.metaDisplayPhoneNumber,
        verifiedName: userAfter.metaVerifiedName,
      });

      const inboundRouting = buildWhatsAppInboundRoutingDiagnostics({
        metaConnected: !!userAfter.metaConnected,
        activeProvider: base.activeProvider,
        metaConnectionType: userAfter.metaConnectionType ?? null,
        coexistenceServerConfigured: coexistenceCfg.coexistenceEnabled,
        webhookSubscribed: !!userAfter.metaWebhookSubscribed,
      });

      res.json({
        activeProvider: base.activeProvider,
        whatsappConnectedReason: base.whatsappConnectedReason,
        metaPersistedButTwilioSelected: !!(userAfter.metaConnected && userAfter.whatsappProvider !== "meta"),
        coexistenceEnabled: coexistenceCfg.coexistenceEnabled,
        coexistenceConfigId: coexistenceCfg.coexistenceConfigId,
        coexistenceFeatureFlagSet: coexistenceCfg.coexistenceFeatureFlagSet,
        inboundRouting,
        phoneGraphSnapshot,
        twilio: {
          ...base.twilio,
          providerLabel: "Twilio WhatsApp",
        },
        meta: {
          ...base.meta,
          providerLabel: "Meta Cloud API",
          connectionType: userAfter.metaConnectionType || null,
          displayPhoneNumber: userAfter.metaDisplayPhoneNumber || null,
          verifiedName: userAfter.metaVerifiedName || null,
          connectedPhoneKind: connectedPhoneClassification.kind,
          connectedToMetaTestNumber: connectedPhoneClassification.kind === "test",
          metaTestNumberWarning:
            connectedPhoneClassification.kind === "test"
              ? "Connected to Meta test number — choose a production WhatsApp number."
              : null,
          integrationStatus:
            userAfter.metaIntegrationStatus ||
            (userAfter.metaConnected ? "connected" : "disconnected"),
          webhookSubscribed: userAfter.metaWebhookSubscribed ?? false,
          webhookLastCheckedAt: userAfter.metaWebhookLastCheckedAt ?? null,
          lastErrorCode: userAfter.metaLastErrorCode ?? null,
          lastErrorMessage: userAfter.metaLastErrorMessage ?? null,
          tokenExpiresAt: userAfter.metaTokenExpiresAt ?? null,
          legacyManualConnection:
            userAfter.metaConnectionType === "manual_legacy" ||
            (!userAfter.metaConnectionType && userAfter.metaConnected),
          /** Meta app secret present — required to verify signed webhook callbacks (separate from WABA app subscription). */
          webhookSignatureHealth: userAfter.metaConnected ? (webhookLikelyOk ? "ok" : "needs_app_secret") : "n/a",
          /** @deprecated Use webhookSignatureHealth — kept for older clients; same value. */
          webhookHealth: userAfter.metaConnected ? (webhookLikelyOk ? "ok" : "needs_app_secret") : "n/a",
          connectionUsedCoexistenceFlow: userAfter.metaConnectionType === "coexistence",
        },
        webhookCallbackUrl: `${String(webhookBaseUrl).replace(/\/+$/, "")}/api/webhook/meta`,
      });
    } catch (e: any) {
      console.error("[WhatsApp Integration] status error", e?.message || e);
      res.status(500).json({ error: "Failed to load WhatsApp status" });
    }
  });

  app.post("/api/integrations/whatsapp/disconnect", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const body = z.object({ provider: z.enum(["meta", "twilio"]) }).safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ error: "provider must be meta or twilio" });
      }
      await disconnectWhatsAppProvider(req.user.id, body.data.provider);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Disconnect failed" });
    }
  });

  /** @deprecated Prefer POST /api/integrations/whatsapp/repair-webhook-subscription */
  app.post("/api/integrations/whatsapp/meta/subscribe-webhooks", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const result = await repairMetaWabaWebhookSubscription(req.user.id);
      if (!result.success && result.errorMessage?.includes("not the active")) {
        return res.status(400).json({ error: result.errorMessage });
      }
      res.json({
        success: result.verified,
        subscribed: result.verified,
        verified: result.verified,
        error: result.errorMessage,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Subscription failed" });
    }
  });

  app.post("/api/integrations/whatsapp/repair-webhook-subscription", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const result = await repairMetaWabaWebhookSubscription(req.user.id);
      if (!result.success && result.errorMessage?.includes("not the active")) {
        return res.status(400).json({
          success: false,
          subscribed: false,
          verified: false,
          error: result.errorMessage,
        });
      }
      res.json({
        success: result.verified,
        subscribed: result.verified,
        verified: result.verified,
        error: result.errorMessage ?? null,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Repair failed" });
    }
  });

  /** Internal diagnostics — redirect URI Meta must whitelist */
  app.get("/api/integrations/whatsapp/meta/redirect-uri", (_req: Request, res: Response) => {
    res.json({ redirectUri: getWhatsappMetaRedirectUri() });
  });
}
