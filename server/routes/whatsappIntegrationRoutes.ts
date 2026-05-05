/**
 * WhatsApp integration: Meta Embedded Signup + unified status API.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod";
import {
  getWhatsappMetaPublicConfig,
  startEmbeddedSignupSession,
  completeEmbeddedSignupOAuth,
  subscribeAppToWaba,
  getWhatsappMetaRedirectUri,
  logWhatsappEmbeddedSignupStartupWarnings,
  applyMetaTokenExpiryAttention,
  getWhatsappConnectionDebug,
  verifyWhatsappEmbeddedSignupMigration,
} from "../whatsappEmbeddedSignup";
import { getAppOrigin } from "../urlOrigins";
import { storage } from "../storage";
import { disconnectWhatsAppProvider, getProviderStatus } from "../whatsappService";
import { getMetaAccessToken } from "../userMeta";
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

  app.post("/api/integrations/whatsapp/meta/start", async (req: Request, res: Response) => {
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

      if (error) {
        console.warn("[WhatsApp Embedded Signup] OAuth error from Meta", { error, errorDescription });
        return failRedirect(errorDescription || error || "Meta returned an error during signup.");
      }
      if (!code || !state) {
        return failRedirect("Missing authorization code. Please try connecting again.");
      }

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
      res.json({ success: true });
    } catch (e: any) {
      console.warn("[WhatsApp Integration] complete-sdk failed", e?.message || e);
      res.status(500).json({ error: "Complete signup failed" });
    }
  });

  /**
   * Temporary diagnostic endpoint: force full redirect OAuth (no JS SDK) to isolate redirect_uri mismatch.
   * This redirects the user-agent to the exact Meta dialog URL we would use for redirect flow.
   */
  app.get("/api/integrations/whatsapp/meta/test-full-redirect", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).send("Unauthorized");
      const flow = (req.query.flow === "coexistence" ? "coexistence" : "embedded") as "embedded" | "coexistence";
      const session = await startEmbeddedSignupSession(req.user.id, flow);
      console.log("[WhatsApp Embedded Signup] test-full-redirect", {
        flow,
        redirectUriUsed: session.redirectUri,
        graphApiVersion: session.sdk.graphApiVersion,
      });
      res.redirect(302, session.authUrl);
    } catch (e: any) {
      res.status(400).send(e?.message || "Could not start full redirect test");
    }
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

  app.get("/api/integrations/whatsapp/status", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      await applyMetaTokenExpiryAttention(req.user.id);
      const userAfter = await storage.getUser(req.user.id);
      if (!userAfter) return res.status(404).json({ error: "User not found" });

      const base = await getProviderStatus(req.user.id);
      const webhookBaseUrl =
        process.env.APP_URL || `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

      let webhookLikelyOk = true;
      if (userAfter.metaConnected && userAfter.whatsappProvider === "meta") {
        webhookLikelyOk = !!(process.env.META_APP_SECRET || userAfter.metaAppSecret);
      }

      res.json({
        activeProvider: base.activeProvider,
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
          webhookHealth: userAfter.metaConnected ? (webhookLikelyOk ? "ok" : "needs_app_secret") : "n/a",
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

  app.post("/api/integrations/whatsapp/meta/subscribe-webhooks", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUser(req.user.id);
      if (!user?.metaConnected || !user.metaBusinessAccountId) {
        return res.status(400).json({ error: "Meta WhatsApp is not connected" });
      }
      const token = await getMetaAccessToken(req.user.id);
      if (!token) return res.status(400).json({ error: "No Meta access token" });

      const ok = await subscribeAppToWaba(user.metaBusinessAccountId, token);
      const now = new Date();
      await storage.updateUser(req.user.id, {
        metaWebhookSubscribed: ok,
        metaWebhookLastCheckedAt: now,
        metaIntegrationStatus: ok ? "connected" : "needs_attention",
      });

      res.json({ success: ok, subscribed: ok });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || "Subscription failed" });
    }
  });

  /** Internal diagnostics — redirect URI Meta must whitelist */
  app.get("/api/integrations/whatsapp/meta/redirect-uri", (_req: Request, res: Response) => {
    res.json({ redirectUri: getWhatsappMetaRedirectUri() });
  });
}
