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
  fetchMetaUserTokenDebugSummary,
  extractAppIdsFromWabaSubscribedAppsPayload,
} from "../whatsappEmbeddedSignup";
import { getAppOrigin } from "../urlOrigins";
import { storage } from "../storage";
import { classifyMetaWhatsAppPhone } from "../metaWhatsAppPhoneKind";
import { disconnectWhatsAppProvider, getProviderStatus } from "../whatsappService";
import { getMetaGraphApiBase } from "../metaGraphVersion";
import { getMetaAccessToken, fetchMetaWhatsAppPhoneNumberGraphSnapshotVerbose } from "../userMeta";
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

  function metaAppIdsEqualLocal(configured: string, candidate: string): boolean {
    const a = configured.trim();
    const b = candidate.trim();
    if (!a || !b) return false;
    if (a === b) return true;
    try {
      return BigInt(a) === BigInt(b);
    } catch {
      return false;
    }
  }

  function truncateJson(v: unknown, max = 12_000): string {
    try {
      const s = JSON.stringify(v);
      return s.length > max ? `${s.slice(0, max)}…[truncated]` : s;
    } catch {
      return "[unserializable]";
    }
  }

  function logCoexistenceDiagnostics(payload: Record<string, unknown>): void {
    console.log(`[CoexistenceDiagnostics] ${JSON.stringify(payload)}`);
  }

  async function probeWebhookMetaReachable(): Promise<{
    webhookEndpointHealthy: boolean;
    webhookProbeHttpStatus: number | null;
    webhookProbeError?: string;
  }> {
    const origin = String(getAppOrigin() || "").replace(/\/+$/, "");
    if (!origin) {
      return {
        webhookEndpointHealthy: false,
        webhookProbeHttpStatus: null,
        webhookProbeError: "APP_URL unset — cannot probe /api/webhook/meta",
      };
    }
    try {
      const url = `${origin}/api/webhook/meta?hub.mode=subscribe&hub.verify_token=__coexistence_probe__&hub.challenge=x`;
      const r = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(10_000) });
      const ok = r.status === 403 || r.status === 200;
      return { webhookEndpointHealthy: ok, webhookProbeHttpStatus: r.status };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { webhookEndpointHealthy: false, webhookProbeHttpStatus: null, webhookProbeError: msg };
    }
  }

  app.get("/api/integrations/whatsapp/coexistence-diagnostics", async (req: Request, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const user = await storage.getUserForSession(req.user.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      const base = await getProviderStatus(req.user.id);
      const wabaId = (user.metaBusinessAccountId || "").trim();
      const phoneNumberId = (user.metaPhoneNumberId || "").trim();
      const connectionSavedAsCoexistence = user.metaConnectionType === "coexistence";

      const token = await getMetaAccessToken(req.user.id);
      if (!token) {
        return res.status(400).json({
          error: "No Meta access token found. Reconnect WhatsApp with Meta to run diagnostics.",
        });
      }

      const graphBase = getMetaGraphApiBase();
      const appId = (process.env.META_APP_ID || "").trim();

      const phoneGraph =
        phoneNumberId.length > 0
          ? await fetchMetaWhatsAppPhoneNumberGraphSnapshotVerbose(token, phoneNumberId)
          : { ok: false as const, fieldsRequested: "", error: { message: "missing_phoneNumberId" } };

      // WABA subscribed apps — confirm our app id is listed.
      let subscribedApps: { httpOk: boolean; status: number; body: any; appIds: string[]; hasConfiguredAppId: boolean } =
        { httpOk: false, status: 0, body: null, appIds: [], hasConfiguredAppId: false };
      if (wabaId) {
        const url = `${graphBase}/${encodeURIComponent(wabaId)}/subscribed_apps?access_token=${encodeURIComponent(token)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const rawText = await r.text();
        let body: any = {};
        try {
          body = rawText ? JSON.parse(rawText) : {};
        } catch {
          body = { _parseError: true as const, rawSnippet: rawText.slice(0, 2000) };
        }
        console.log(
          `[WABA SubscribedApps GET] raw ${JSON.stringify({
            wabaId,
            httpStatus: r.status,
            httpOk: r.ok,
            rawResponse:
              typeof rawText === "string" && rawText.length > 16_000
                ? `${rawText.slice(0, 16_000)}…[truncated]`
                : rawText,
          })}`
        );
        const appIds = extractAppIdsFromWabaSubscribedAppsPayload(body);
        const hasConfiguredAppId = appId ? appIds.some((rid) => metaAppIdsEqualLocal(appId, rid)) : false;
        subscribedApps = { httpOk: r.ok, status: r.status, body, appIds, hasConfiguredAppId };
      }

      // WABA phone_numbers listing — does the saved phone appear under this WABA?
      let wabaPhones: { httpOk: boolean; status: number; body: any; phoneIds: string[]; phoneUnderWaba: boolean } =
        { httpOk: false, status: 0, body: null, phoneIds: [], phoneUnderWaba: false };
      if (wabaId) {
        const fields =
          "id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,throughput,messaging_limit_tier,status,platform_type,account_mode";
        const url =
          `${graphBase}/${encodeURIComponent(wabaId)}/phone_numbers?fields=${encodeURIComponent(fields)}` +
          `&limit=100&access_token=${encodeURIComponent(token)}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        const body = (await r.json().catch(() => ({}))) as any;
        const rows = Array.isArray(body?.data) ? body.data : [];
        const phoneIds = rows.map((x: any) => String(x?.id ?? "").trim()).filter((s: string) => s.length > 0);
        const phoneUnderWaba = !!(phoneNumberId && phoneIds.includes(phoneNumberId));
        wabaPhones = { httpOk: r.ok, status: r.status, body, phoneIds, phoneUnderWaba };
      }

      const graphCodeVerificationStatus =
        (phoneGraph.ok ? (phoneGraph.data?.code_verification_status as unknown) : null) ?? null;
      const graphPhoneStatus =
        (phoneGraph.ok ? (phoneGraph.data?.status as unknown) : null) ?? null;

      const debugToken = await fetchMetaUserTokenDebugSummary(token);
      const webhookProbe = await probeWebhookMetaReachable();

      const phoneStatusStr =
        phoneGraph.ok && phoneGraph.data?.status != null ? String(phoneGraph.data.status) : null;
      const codeVerificationStr =
        phoneGraph.ok && phoneGraph.data?.code_verification_status != null
          ? String(phoneGraph.data.code_verification_status)
          : null;
      const platformTypeStr =
        phoneGraph.ok && phoneGraph.data?.platform_type != null ? String(phoneGraph.data.platform_type) : null;
      const qualityRatingStr =
        phoneGraph.ok && phoneGraph.data?.quality_rating != null ? String(phoneGraph.data.quality_rating) : null;
      const nameStatusStr =
        phoneGraph.ok && phoneGraph.data?.name_status != null ? String(phoneGraph.data.name_status) : null;
      const displayPhoneStr =
        phoneGraph.ok && phoneGraph.data?.display_phone_number != null
          ? String(phoneGraph.data.display_phone_number)
          : null;
      const verifiedNameStr =
        phoneGraph.ok && phoneGraph.data?.verified_name != null ? String(phoneGraph.data.verified_name) : null;

      // We cannot guarantee Graph exposes “routing” explicitly; provide best-effort inference.
      let inboundWebhookExpectedByGraph: "yes" | "no" | "unknown" = "unknown";
      const reasons: string[] = [];
      if (base.activeProvider !== "meta") reasons.push("activeProvider is not meta (provider selection mismatch)");
      if (!user.metaConnected) reasons.push("metaConnected=false (saved connection not active)");
      if (!(user.metaWebhookSubscribed ?? false)) reasons.push("metaWebhookSubscribed=false (WABA subscribed_apps may be ok but workspace flag false)");
      if (!wabaId) reasons.push("missing saved wabaId");
      if (!phoneNumberId) reasons.push("missing saved phoneNumberId");
      if (!connectionSavedAsCoexistence) reasons.push("meta_connection_type is not coexistence");
      if (phoneGraph.ok && String(graphCodeVerificationStatus || "").toUpperCase() !== "VERIFIED") {
        reasons.push(`code_verification_status=${String(graphCodeVerificationStatus) || "null"} (may block Cloud API delivery in some setups)`);
      }
      if (wabaPhones.httpOk && phoneNumberId && !wabaPhones.phoneUnderWaba) {
        reasons.push("saved phoneNumberId is not present in GET /{waba}/phone_numbers listing (permissions or discovery gap)");
      }
      if (subscribedApps.httpOk && appId && !subscribedApps.hasConfiguredAppId) {
        reasons.push("configured META_APP_ID not present in GET /{waba}/subscribed_apps");
      }
      if (base.activeProvider === "meta" && user.metaConnected && (user.metaWebhookSubscribed ?? false) && user.metaIntegrationStatus === "connected") {
        inboundWebhookExpectedByGraph = "unknown";
      }

      let blockerReason = "";
      if (wabaId && !subscribedApps.httpOk) {
        blockerReason =
          "GET /{waba-id}/subscribed_apps failed — token may lack whatsapp_business_management or WABA id wrong. See wabaSubscribedApps.error.";
      } else if (!webhookProbe.webhookEndpointHealthy) {
        blockerReason =
          webhookProbe.webhookProbeError ||
          `Railway/app URL not reachable for GET /api/webhook/meta (probe HTTP ${webhookProbe.webhookProbeHttpStatus ?? "n/a"})`;
      } else if (appId && debugToken.app_id && !metaAppIdsEqualLocal(appId, debugToken.app_id)) {
        blockerReason =
          `B) Access token is for app_id ${debugToken.app_id} but META_APP_ID is ${appId} — OAuth/wrong app or env mismatch.`;
      } else if (appId && subscribedApps.httpOk && !subscribedApps.hasConfiguredAppId) {
        blockerReason =
          "A) Meta App ID " +
          appId +
          " is not listed on GET /{waba-id}/subscribed_apps — subscribe the app to this WABA (Repair button POST).";
      } else if (!debugToken.ok || debugToken.is_valid === false) {
        blockerReason =
          "B) User access token failed debug_token validation or is_valid=false — reconnect OAuth / check scopes.";
      } else if (
        subscribedApps.httpOk &&
        subscribedApps.hasConfiguredAppId &&
        phoneGraph.ok &&
        String(graphPhoneStatus || "").toUpperCase() === "DISCONNECTED" &&
        String(graphCodeVerificationStatus || "").toUpperCase() === "NOT_VERIFIED"
      ) {
        blockerReason =
          "C) Phone Cloud API status is DISCONNECTED / NOT_VERIFIED. WABA subscription is OK, but Meta has not activated Cloud API routing for this phone.";
      } else if (
        phoneGraph.ok &&
        (String(graphPhoneStatus || "").toUpperCase() === "DISCONNECTED" ||
          String(graphCodeVerificationStatus || "").toUpperCase() === "NOT_VERIFIED")
      ) {
        blockerReason =
          "C) Phone Cloud API shows DISCONNECTED or code_verification_status NOT_VERIFIED — customer messages may stay in WhatsApp Business app.";
      } else if (!connectionSavedAsCoexistence && reasons.some((r) => r.includes("coexistence"))) {
        blockerReason = "D) Connection not saved as coexistence — provisioning route may differ.";
      } else if (!reasons.length && webhookProbe.webhookEndpointHealthy && subscribedApps.hasConfiguredAppId) {
        blockerReason =
          "No definitive Graph blocker. If Railway still sees zero POST /api/webhook/meta for WhatsApp, check Meta App Dashboard WhatsApp product webhook fields (messages), phone registration, or coexistence onboarding delay.";
      } else {
        blockerReason = reasons[0] || "Review reasons[] and Meta Business Manager.";
      }

      const routingLikelyActive =
        webhookProbe.webhookEndpointHealthy &&
        !!(appId && subscribedApps.hasConfiguredAppId) &&
        debugToken.ok !== false &&
        debugToken.is_valid !== false &&
        (!phoneGraph.ok ||
          (String(graphPhoneStatus || "").toUpperCase() !== "DISCONNECTED" &&
            String(graphCodeVerificationStatus || "").toUpperCase() !== "NOT_VERIFIED")) &&
        wabaPhones.phoneUnderWaba;

      const payload = {
        /** Flat summary for operators */
        wabaId: wabaId || null,
        phoneNumberId: phoneNumberId || null,
        appIdExpected: appId || null,
        subscribedApps: subscribedApps.httpOk ? subscribedApps.body : null,
        configuredAppIdPresent: subscribedApps.hasConfiguredAppId,
        phoneStatus: phoneStatusStr,
        codeVerificationStatus: codeVerificationStr,
        platformType: platformTypeStr,
        qualityRating: qualityRatingStr,
        nameStatus: nameStatusStr,
        displayPhoneNumber: displayPhoneStr,
        verifiedName: verifiedNameStr,
        webhookEndpointHealthy: webhookProbe.webhookEndpointHealthy,
        webhookProbeHttpStatus: webhookProbe.webhookProbeHttpStatus,
        webhookProbeError: webhookProbe.webhookProbeError ?? null,
        routingLikelyActive,
        blockerReason,
        debugToken,
        tokenAppIdFromDebug: debugToken.app_id ?? null,
        connectionSavedAsCoexistence,
        activeProvider: base.activeProvider,
        meta: {
          connected: !!user.metaConnected,
          integrationStatus: user.metaIntegrationStatus ?? null,
          webhookSubscribedFlag: user.metaWebhookSubscribed ?? false,
          connectionType: user.metaConnectionType ?? null,
          wabaId: wabaId || null,
          phoneNumberId: phoneNumberId || null,
          displayPhoneNumber: user.metaDisplayPhoneNumber ?? null,
        },
        graphPhone: {
          ok: phoneGraph.ok,
          httpStatus: phoneGraph.httpStatus ?? null,
          fieldsRequested: phoneGraph.fieldsRequested,
          data: phoneGraph.ok ? phoneGraph.data : null,
          error: phoneGraph.ok ? null : phoneGraph.error ?? null,
        },
        graphPhoneStatus,
        graphCodeVerificationStatus,
        wabaSubscribedApps: {
          httpOk: subscribedApps.httpOk,
          httpStatus: subscribedApps.status,
          configuredAppIdPresent: subscribedApps.hasConfiguredAppId,
          appIds: subscribedApps.appIds.slice(0, 200),
          error: subscribedApps.httpOk ? null : (subscribedApps.body?.error ?? null),
        },
        phoneUnderWaba: wabaPhones.phoneUnderWaba,
        wabaPhoneNumbers: {
          httpOk: wabaPhones.httpOk,
          httpStatus: wabaPhones.status,
          phoneIds: wabaPhones.phoneIds.slice(0, 200),
          error: wabaPhones.httpOk ? null : (wabaPhones.body?.error ?? null),
        },
        inboundWebhookExpectedByGraph,
        reasons,
      };

      logCoexistenceDiagnostics({
        userId: req.user.id,
        connectionSavedAsCoexistence,
        wabaId: wabaId || null,
        phoneNumberId: phoneNumberId || null,
        phoneGraphOk: phoneGraph.ok,
        subscribedAppsOk: subscribedApps.httpOk,
        phoneUnderWaba: wabaPhones.phoneUnderWaba,
        graphPhoneTruncated: truncateJson(phoneGraph.ok ? phoneGraph.data : phoneGraph.error, 7000),
        subscribedAppsTruncated: truncateJson({ appIds: subscribedApps.appIds, error: subscribedApps.body?.error ?? null }, 7000),
        wabaPhonesTruncated: truncateJson({ phoneIds: wabaPhones.phoneIds, error: wabaPhones.body?.error ?? null }, 7000),
      });

      return res.json(payload);
    } catch (e: any) {
      console.error("[CoexistenceDiagnostics] error:", e?.message || e);
      return res.status(500).json({ error: e?.message || "Diagnostics failed" });
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
      console.log(
        `[WABA Repair] endpoint_response ${JSON.stringify({
          userId: req.user.id,
          verified: result.verified,
          success: result.success,
          errorMessage: result.errorMessage ?? null,
        })}`
      );
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
