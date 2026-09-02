import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { storage } from './storage';
import { CRM_CONNECTED_BODY, CRM_CONNECTED_TITLE } from '@shared/leadConnectorWhiteLabel';
import { GHL_TO_CRM_STAGE_MAP, GHL_STATUS_TO_CRM_STAGE } from './ghlSync';
import { db } from '../drizzle/db';
import { contacts, conversations } from '@shared/schema';
import { eq, and, inArray, notInArray } from 'drizzle-orm';
import { getAppOrigin } from './urlOrigins';
import { scheduleHubSpotAutoSync } from './hubspotAutoSync';
import {
  evaluateUnlinkedOAuthRecoveryEligibility,
  findMarketplaceInstallByOAuthIdentity,
  upsertGhlMarketplaceInstall,
} from './ghlMarketplaceService';
import { getGhlMarketplaceOAuthConfig } from './ghlOAuthConfig';
import {
  logGhlOAuthDiagnostic,
  summarizeGhlConnectionState,
  resolveUserGhlConnectionStatus,
} from './ghlConnectionDiagnostics';
import {
  buildGhlOAuthAuthorizeDebugSnapshot,
  logGhlOAuthAuthorizeDebugSnapshot,
} from './ghlOAuthDebug';
import {
  appendStateToInstallUrl,
  clearGhlOAuthPending,
  clearGhlOAuthSession,
  createGhlOAuthState,
  exchangeGhlAuthorizationCode,
  getDefaultGhlRedirectUri,
  persistGhlIntegrationForUser,
  readGhlOAuthSessionUserId,
  saveSessionValue,
} from './ghlOAuthFlow';
import { recoverGhlOAuthFromMarketplaceInstall } from './ghlOAuthRecovery';
import { claimGhlOAuthHandoffForUser, claimGhlOAuthHandoffIfPresent, createGhlOAuthPendingHandoff } from './ghlOAuthHandoff';
import { GHL_OAUTH_HANDOFF_POST_AUTH_REDIRECT } from '@shared/ghlOAuthHandoff';
import { requireAuth } from './auth';
import {
  canAccessGhlOAuthRecoveryTools,
  isGhlOAuthRecoveryAllowlisted,
} from '@shared/ghlOAuthRecoveryAccess';
import { INCLUDE_INBOX_IDENTITIES, isEmailInboxIdentitySource } from '@shared/contactCrmVisibility';
import { promoteInboxIdentityToCrm } from './emailChannel/contactMatch';
import { persistGhlMarketplaceLifecycleEvent } from './ghlMarketplaceLifecycleService';
import { stripGhlOAuthSecretsFromPayload } from '@shared/ghlConnectionState';
import { verifyGhlWebhookSignature, ghlWebhookSignatureReadiness } from './ghlWebhookSignature';
import { normalizeGhlLifecycleEventType } from '@shared/ghlMarketplaceLifecycle';
import { ghlMarketplacePlanConfigReadiness } from '@shared/ghlMarketplacePlanIds';
import type { Contact } from '@shared/schema';

const router = Router();

async function loadContactsForIdentityMatch(userId: string): Promise<Contact[]> {
  return storage.getContacts(userId, 5000, INCLUDE_INBOX_IDENTITIES);
}

async function promoteInboxIdentityOnGhlMatch(contact: Contact): Promise<Contact> {
  if (!isEmailInboxIdentitySource(contact.source)) return contact;
  return promoteInboxIdentityToCrm(contact, "gohighlevel");
}

const marketplaceOAuthBoot = getGhlMarketplaceOAuthConfig();
if (!marketplaceOAuthBoot.configured) {
  console.warn(
    "[LeadConnector] Marketplace install URL not ready:",
    marketplaceOAuthBoot.error || "unknown configuration error",
  );
} else {
  console.log(
    "[LeadConnector] Marketplace install ready (app:",
    marketplaceOAuthBoot.appIdPrefix || "unknown",
    ")",
  );
}

function resolveSessionUserId(req: Request): string | undefined {
  const authUser = (req as Request & { user?: { id?: string } }).user;
  return (
    authUser?.id ||
    (typeof (req as any).session?.passport?.user === "string"
      ? ((req as any).session.passport.user as string)
      : undefined) ||
    (req as any).session?.userId
  );
}

function isPlatformAdminSession(req: Request): boolean {
  return (req as Request & { session?: { isAdmin?: boolean } }).session?.isAdmin === true;
}

function readSessionForRecovery(req: Request): { isAdmin?: boolean } {
  return ((req as Request & { session?: { isAdmin?: boolean } }).session || {}) as {
    isAdmin?: boolean;
  };
}

async function resolveGhlOAuthRecoveryContext(req: Request) {
  const userId = resolveSessionUserId(req);
  if (!userId) return null;
  const user = await storage.getUser(userId);
  const session = readSessionForRecovery(req);
  const sessionIsAdmin = session.isAdmin === true;
  const recoveryAllowlistEligible = isGhlOAuthRecoveryAllowlisted(user?.email);
  return {
    userId,
    user,
    session,
    sessionIsAdmin,
    recoveryAllowlistEligible,
    canAccessRecoveryTools: canAccessGhlOAuthRecoveryTools(user, session),
    canRecoverInstalls: sessionIsAdmin || recoveryAllowlistEligible,
  };
}

router.post('/recover-oauth', requireAuth, async (req: Request, res: Response) => {
  const userId = resolveSessionUserId(req);
  if (!userId) {
    const body = {
      recovered: false,
      reason: 'not_authenticated',
      reasonCategory: 'other',
      oauthRequired: true,
    };
    console.log(JSON.stringify({ tag: '[GHL-OAuth-Recovery]', event: 'recover_oauth_response', ...body }));
    return res.status(401).json(body);
  }

  try {
    const user = await storage.getUser(userId);
    const marketplaceInstallId =
      typeof req.body?.marketplaceInstallId === 'string' ? req.body.marketplaceInstallId : undefined;
    const adminOverrideRequested = req.body?.adminOverride === true;
    const recoveryContext = await resolveGhlOAuthRecoveryContext(req);
    const adminOverride =
      adminOverrideRequested && Boolean(recoveryContext?.canAccessRecoveryTools);

    const claim = await claimGhlOAuthHandoffIfPresent(req, res, userId);
    if (claim?.claimed) {
      const body = {
        recovered: true,
        reason: 'handoff_claimed',
        reasonCategory: 'other',
        oauthRequired: false,
        integrationId: claim.integrationId,
        created: claim.created,
        locationId: claim.locationId,
        companyId: claim.companyId,
      };
      console.log(JSON.stringify({ tag: '[GHL-OAuth-Recovery]', event: 'recover_oauth_response', userId, ...body }));
      return res.json(body);
    }

    if (adminOverride) {
      logGhlOAuthDiagnostic('oauth_recovery_admin_override', {
        userId,
        userEmail: user?.email ?? null,
        marketplaceInstallId: marketplaceInstallId ?? null,
      });
    } else {
      logGhlOAuthDiagnostic('oauth_recovery_attempted', {
        userId,
        userEmail: user?.email ?? null,
        marketplaceInstallId: marketplaceInstallId ?? null,
        isPlatformAdmin: false,
        recoveryAllowlistEligible: false,
        customerFacing: true,
      });
    }

    const result = await recoverGhlOAuthFromMarketplaceInstall({
      userId,
      userEmail: user?.email,
      isPlatformAdmin: adminOverride,
      isRecoveryAllowlisted: adminOverride,
      marketplaceInstallId,
    });

    console.log(
      JSON.stringify({
        tag: '[GHL-OAuth-Recovery]',
        event: 'recover_oauth_response',
        userId,
        userEmail: user?.email ?? null,
        adminOverride,
        ...result,
      }),
    );

    if (!result.recovered) {
      return res.status(result.reason === 'install_not_owned_or_missing_tokens' ? 403 : 200).json({
        ...result,
        oauthRequired: true,
      });
    }

    return res.json(result);
  } catch (error) {
    const body = {
      recovered: false,
      reason: 'recovery_failed',
      reasonCategory: 'other',
      oauthRequired: true,
      error: error instanceof Error ? error.message : String(error),
    };
    logGhlOAuthDiagnostic('oauth_recovery_token_invalid', {
      userId,
      reason: body.error,
      reasonCategory: 'other',
    });
    console.error('[LeadConnector] recover-oauth error:', error);
    console.log(JSON.stringify({ tag: '[GHL-OAuth-Recovery]', event: 'recover_oauth_response', userId, ...body }));
    return res.status(500).json(body);
  }
});

router.post('/claim-oauth', requireAuth, async (req: Request, res: Response) => {
  const userId = resolveSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ claimed: false, reason: 'not_authenticated', oauthRequired: true });
  }
  const result = await claimGhlOAuthHandoffForUser(req, res, userId, {
    companyId: typeof req.body?.companyId === 'string' ? req.body.companyId : undefined,
    locationId: typeof req.body?.locationId === 'string' ? req.body.locationId : undefined,
    appId: typeof req.body?.appId === 'string' ? req.body.appId : undefined,
    versionId: typeof req.body?.versionId === 'string' ? req.body.versionId : undefined,
    ghlUserId: typeof req.body?.ghlUserId === 'string' ? req.body.ghlUserId : undefined,
  });
  if (!result.claimed) {
    return res.status(result.reason === 'identity_mismatch' ? 403 : 200).json({
      ...result,
      oauthRequired: result.reason !== 'missing_token',
    });
  }
  return res.json(result);
});

const GHL_TOKEN_URL = 'https://services.leadconnectorhq.com/oauth/token';
const GHL_CLIENT_ID = process.env.GHL_CLIENT_ID || '';
const GHL_CLIENT_SECRET = process.env.GHL_CLIENT_SECRET || '';

function isUniqueExternalMessageViolation(err: unknown): boolean {
  const e = err as { code?: string; constraint?: string; message?: string; detail?: string };
  if (e?.code !== "23505") return false;
  const joined = `${e.constraint || ""} ${e.message || ""} ${e.detail || ""}`;
  return joined.includes("messages_user_external_message_id_uq") || joined.includes("external_message_id");
}

function logGhlDuplicateIgnored(externalMessageId: string): void {
  console.log(
    JSON.stringify({
      tag: "[InboundDedup]",
      event: "duplicate_ignored",
      provider: "gohighlevel",
      external_message_id: externalMessageId,
    })
  );
}

router.get('/marketplace-install', async (_req: Request, res: Response) => {
  try {
    const config = getGhlMarketplaceOAuthConfig();
    if (!config.configured) {
      return res.status(503).json({
        configured: false,
        installUrl: null,
        error: config.error,
        redirectUri: config.redirectUri,
      });
    }
    res.json({
      configured: true,
      oauthAuthorizeUrl: "/api/ext/oauth-authorize",
      marketplaceInstallUrl: config.marketplaceInstallUrl,
      installUrl: config.marketplaceInstallUrl,
      redirectUri: config.redirectUri,
      appIdPrefix: config.appIdPrefix,
      error: null,
    });
  } catch (error) {
    console.error("[LeadConnector] marketplace-install config error:", error);
    res.status(500).json({
      configured: false,
      installUrl: null,
      error: "Failed to load CRM install configuration.",
    });
  }
});

router.get('/oauth-authorize-debug', requireAuth, async (req: Request, res: Response) => {
  const userId = resolveSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const recoveryContext = await resolveGhlOAuthRecoveryContext(req);
  if (!recoveryContext?.canAccessRecoveryTools) {
    return res.status(403).json({ error: "CRM connection diagnostics are not available for this account." });
  }
  const snapshot = buildGhlOAuthAuthorizeDebugSnapshot(userId);
  logGhlOAuthAuthorizeDebugSnapshot("oauth_authorize_debug_requested", snapshot, {
    sessionUserId: userId,
  });
  res.json(snapshot);
});

function renderGhlOAuthAuthorizeDebugHtml(snapshot: ReturnType<typeof buildGhlOAuthAuthorizeDebugSnapshot>): string {
  const rows = [
    ["authorizeUrl", snapshot.authorizeUrl],
    ["includesVersionId", String(snapshot.includesVersionId)],
    ["redirect_uri", snapshot.redirectUri],
    ["client_id", snapshot.clientId || ""],
    ["scope", snapshot.scope],
    ["statePresent", String(snapshot.statePresent)],
    ["response_type", snapshot.responseType || ""],
    ["host", snapshot.host],
    ["path", snapshot.path],
    ["expectedCallback", snapshot.expectedCallbackExample],
  ];
  const warningBlock =
    snapshot.warnings.length > 0
      ? `<div class="warn"><strong>Warnings</strong><ul>${snapshot.warnings.map((w) => `<li>${w}</li>`).join("")}</ul></div>`
      : "";
  const notesBlock = `<div class="note"><ul>${snapshot.notes.map((n) => `<li>${n}</li>`).join("")}</ul></div>`;
  return `<!DOCTYPE html>
<html><head><title>CRM OAuth debug</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 960px; margin: 24px auto; padding: 0 16px; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; word-break: break-all; }
  th { width: 180px; background: #f8fafc; }
  .warn { background: #fff7ed; border: 1px solid #fdba74; padding: 12px; border-radius: 8px; margin: 12px 0; }
  .note { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin: 12px 0; font-size: 14px; }
  .btn { display: inline-block; margin-top: 16px; padding: 10px 16px; background: #16a34a; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
</style></head><body>
  <h1>CRM OAuth authorize debug</h1>
  <p>Temporary diagnostic — verify URL before redirecting to GoHighLevel.</p>
  ${warningBlock}
  <table>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</table>
  ${notesBlock}
  <a class="btn" href="${snapshot.authorizeUrl.replace(/"/g, "&quot;")}">Continue to GoHighLevel OAuth</a>
</body></html>`;
}

router.get('/oauth-authorize', requireAuth, async (req: Request, res: Response) => {
  const userId = resolveSessionUserId(req);
  if (!userId) {
    return res.status(401).send("Login to WhachatCRM before connecting your CRM account.");
  }

  const config = getGhlMarketplaceOAuthConfig();
  if (!config.configured || !config.oauthAuthorizeUrl) {
    logGhlOAuthDiagnostic("callback_oauth_error", {
      event: "oauth_authorize_misconfigured",
      sessionUserId: userId,
      error: config.error,
    });
    return res
      .status(503)
      .send(config.error || "CRM connection is not configured on the server. Contact support.");
  }

  try {
    const state = createGhlOAuthState(userId);
    await saveSessionValue(req, "ghlOAuthUserId", userId);
    await saveSessionValue(req, "ghlOAuthStartedAt", Date.now());
    await saveSessionValue(req, "ghlMarketplaceInstallPending", true);

    const authorizeUrl = appendStateToInstallUrl(config.oauthAuthorizeUrl, state);
    const debugSnapshot = buildGhlOAuthAuthorizeDebugSnapshot(userId);
    debugSnapshot.authorizeUrl = authorizeUrl;
    debugSnapshot.statePresent = true;
    logGhlOAuthAuthorizeDebugSnapshot("oauth_authorize_started", debugSnapshot, {
      sessionUserId: userId,
    });

    if (req.query.debug === "1" || req.query.debug === "true") {
      const recoveryContext = await resolveGhlOAuthRecoveryContext(req);
      if (recoveryContext?.canAccessRecoveryTools) {
        return res.send(renderGhlOAuthAuthorizeDebugHtml(debugSnapshot));
      }
    }

    return res.redirect(authorizeUrl);
  } catch (error) {
    console.error("[LeadConnector] oauth-authorize error:", error);
    return res.status(500).send("Could not start CRM authorization. Please try again.");
  }
});

router.get('/callback', async (req: Request, res: Response) => {
  const oauthIntentUserId = readGhlOAuthSessionUserId(req);
  const sessionUserId = resolveSessionUserId(req);
  const ownerUserId = oauthIntentUserId || sessionUserId;
  logGhlOAuthDiagnostic("callback_received", {
    sessionUserId: sessionUserId ?? null,
    oauthIntentUserId: oauthIntentUserId ?? null,
    ownerUserId: ownerUserId ?? null,
    hasSession: Boolean((req as Request & { session?: unknown }).session),
    host: req.get("host"),
    forwardedHost: req.headers["x-forwarded-host"],
    hasCode: typeof req.query.code === "string",
    hasState: typeof req.query.state === "string",
    oauthError: req.query.error ?? null,
  });

  try {
    const { code, error, error_description } = req.query;

    if (error) {
      logGhlOAuthDiagnostic("callback_oauth_error", {
        error,
        error_description: error_description ?? null,
        sessionUserId: sessionUserId ?? null,
      });
      console.error('[LeadConnector] OAuth error:', error, error_description);
      return res.status(400).send(`CRM authorization failed: ${error_description || error}`);
    }

    if (!code || typeof code !== 'string') {
      logGhlOAuthDiagnostic("callback_missing_code", {
        queryKeys: Object.keys(req.query).filter((key) => key !== "code"),
        sessionUserId: sessionUserId ?? null,
        alreadyInstalledHint:
          "If the CRM app is already installed, GHL may not issue a new code. Uninstall and reinstall, or finish login to claim a pending Marketplace install.",
      });
      console.error('[LeadConnector] No authorization code received. Query keys:', Object.keys(req.query).filter((key) => key !== "code"));
      return res.status(400).send(
        'Missing authorization code. If the CRM app is already installed, uninstall it in CRM settings and install again, or log in to WhachatCRM to finish a pending Marketplace install.',
      );
    }

    console.log('[LeadConnector] Received authorization code, exchanging for tokens...');

    const clientId = String(process.env.GHL_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GHL_CLIENT_SECRET || "").trim();
    const redirectUri = getDefaultGhlRedirectUri();

    if (!clientId || !clientSecret) {
      console.error('[LeadConnector] Missing GHL_CLIENT_ID or GHL_CLIENT_SECRET');
      return res.status(500).send('CRM integration is not configured. Please contact support.');
    }

    console.log('[LeadConnector] Sending token request to:', GHL_TOKEN_URL);

    const exchange = await exchangeGhlAuthorizationCode(
      code,
      redirectUri,
      clientId,
      clientSecret,
    );

    if (!exchange.ok) {
      logGhlOAuthDiagnostic("callback_token_exchange_failed", {
        sessionUserId: sessionUserId ?? null,
        oauthIntentUserId: oauthIntentUserId ?? null,
        httpStatus: exchange.httpStatus,
        oauthError: exchange.data?.error ?? null,
        oauthErrorDescription: exchange.data?.error_description ?? null,
        reason: exchange.data ? undefined : "non_json_response",
        redirectUri,
      });
      console.error('[LeadConnector] Token exchange failed:', exchange.httpStatus, exchange.data?.error || exchange.httpStatus);
      return res.status(400).send(
        `Failed to connect CRM account: ${exchange.data?.error_description || exchange.data?.error || 'Unknown error'}. Please try again.`,
      );
    }

    const tokenData = exchange.data;

    logGhlOAuthDiagnostic("callback_token_exchange_ok", {
      sessionUserId: sessionUserId ?? null,
      oauthIntentUserId: oauthIntentUserId ?? null,
      ownerUserId: ownerUserId ?? null,
      userType: tokenData.userType ?? null,
      locationId: tokenData.locationId ?? null,
      companyId: tokenData.companyId ?? null,
      hasRefreshToken: Boolean(tokenData.refresh_token),
      expiresIn: tokenData.expires_in ?? null,
    });

    console.log('[LeadConnector] Token exchange successful:', {
      userType: tokenData.userType,
      locationId: tokenData.locationId,
      companyId: tokenData.companyId,
      scope: tokenData.scope,
      expiresIn: tokenData.expires_in,
    });

    const marketplaceRow = await upsertGhlMarketplaceInstall({
      companyId: tokenData.companyId || "unknown",
      locationId: tokenData.locationId || null,
      subAccountName: `CRM Integration - ${tokenData.userType === 'Location' ? 'Location' : 'Agency'} (${tokenData.locationId || tokenData.companyId || 'unknown'})`,
      installDate: new Date().toISOString(),
      installationStatus: "Active",
      source: "oauth",
      rawPayload: stripGhlOAuthSecretsFromPayload({
        userType: tokenData.userType,
        locationId: tokenData.locationId,
        companyId: tokenData.companyId,
        scope: tokenData.scope,
        expires_in: tokenData.expires_in,
      }),
    });
    const matchedInstall =
      (await findMarketplaceInstallByOAuthIdentity({
        locationId: tokenData.locationId || marketplaceRow.locationId,
        companyId: tokenData.companyId || marketplaceRow.companyId,
      })) || marketplaceRow;

    logGhlOAuthDiagnostic("callback_marketplace_upserted", {
      locationId: matchedInstall.locationId ?? null,
      companyId: matchedInstall.companyId ?? null,
      appId: matchedInstall.appId ?? null,
      versionId: matchedInstall.versionId ?? null,
      sessionUserId: sessionUserId ?? null,
      ownerUserId: ownerUserId ?? null,
    });

    const identityHints = {
      appId: matchedInstall.appId,
      versionId: matchedInstall.versionId,
      ghlUserId: matchedInstall.ghlUserId,
    };

    if (!ownerUserId) {
      logGhlOAuthDiagnostic("callback_no_session_user", {
        locationId: matchedInstall.locationId ?? null,
        companyId: matchedInstall.companyId ?? null,
        note: "Creating encrypted pending OAuth handoff for login/signup claim",
      });
      await createGhlOAuthPendingHandoff(
        {
          tokenData,
          companyId: matchedInstall.companyId,
          locationId: matchedInstall.locationId,
          appId: matchedInstall.appId,
          versionId: matchedInstall.versionId,
          ghlUserId: matchedInstall.ghlUserId,
          marketplaceInstallId: matchedInstall.id,
        },
        res,
      );
      clearGhlOAuthSession(req);
      const authUrl = `${getAppOrigin()}/auth?redirect=${encodeURIComponent(GHL_OAUTH_HANDOFF_POST_AUTH_REDIRECT)}`;
      return res.redirect(302, authUrl);
    }

    const { integration, created } = await persistGhlIntegrationForUser(ownerUserId, tokenData, identityHints);
    console.log(
      `[LeadConnector] ${created ? "Created" : "Updated"} integration:`,
      integration.id,
      "for user:",
      ownerUserId,
    );
    logGhlOAuthDiagnostic(
      created ? "callback_integration_created" : "callback_integration_updated",
      {
        integrationId: integration.id,
        userId: ownerUserId,
        locationId: tokenData.locationId ?? matchedInstall.locationId ?? null,
        companyId: tokenData.companyId ?? matchedInstall.companyId ?? null,
        sessionUserId: sessionUserId ?? null,
        oauthIntentUserId: oauthIntentUserId ?? null,
      },
    );
    logGhlOAuthDiagnostic("connection_completed", {
      integrationId: integration.id,
      userId: ownerUserId,
      locationId: tokenData.locationId ?? matchedInstall.locationId ?? null,
      companyId: tokenData.companyId ?? matchedInstall.companyId ?? null,
      created,
      hasAccessToken: true,
      hasRefreshToken: Boolean(tokenData.refresh_token),
    });
    clearGhlOAuthPending(req);
    clearGhlOAuthSession(req);

    const postSummary = await summarizeGhlConnectionState();
    logGhlOAuthDiagnostic("callback_completed", {
      sessionUserId: sessionUserId ?? null,
      oauthIntentUserId: oauthIntentUserId ?? null,
      ownerUserId,
      integrationPersisted: true,
      eligibleProspectImportLocations: postSummary.prospectImport.eligibleForImport,
      likelyIssue: postSummary.likelyIssue,
    });

    const successHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${CRM_CONNECTED_TITLE}</title>
        <style>
          body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f8fafc; }
          .card { text-align: center; padding: 48px; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 400px; }
          .check { width: 64px; height: 64px; background: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
          .check svg { width: 32px; height: 32px; fill: white; }
          h1 { margin: 0 0 8px; font-size: 24px; color: #1e293b; }
          p { color: #64748b; margin: 0 0 24px; }
          .btn { display: inline-block; padding: 12px 32px; background: #25D366; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="check"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
          <h1>${CRM_CONNECTED_TITLE}</h1>
          <p>${CRM_CONNECTED_BODY}</p>
          <a href="${getAppOrigin()}/app/integrations" class="btn">Back to WhachatCRM</a>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'leadconnector_connected', success: true }, '*');
          }
        </script>
      </body>
      </html>
    `;

    return res.send(successHtml);
  } catch (error) {
    logGhlOAuthDiagnostic("callback_failed", {
      sessionUserId: sessionUserId ?? null,
      oauthIntentUserId: oauthIntentUserId ?? null,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error('[LeadConnector] Callback error:', error);
    return res.status(500).send('An error occurred while connecting your CRM account. Please try again.');
  }
});

router.post('/webhook', handleGhlWebhook);

export async function handleGhlWebhook(req: Request, res: Response) {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const verified = verifyGhlWebhookSignature({
    rawBody,
    headers: req.headers as Record<string, unknown>,
  });
  if (!verified.ok) {
    logGhlOAuthDiagnostic("webhook_signature_rejected", {
      reason: verified.reason,
      hasRawBody: Boolean(rawBody && rawBody.length > 0),
    });
    return res.status(401).json({ error: "Invalid webhook signature" });
  }

  const timestamp = new Date().toISOString();
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as any;
  const type = String(body.type || "UNKNOWN");
  const locationId = (body.locationId as string) || null;
  const eventId = (body.eventId as string) || (body.id as string) || null;
  const lifecycleType = normalizeGhlLifecycleEventType(type);

  console.log(
    `[LeadConnector Webhook] ${timestamp} | Event: ${type} | Location: ${locationId || "N/A"}`,
  );

  logGhlOAuthDiagnostic("webhook_event_received", {
    eventType: type,
    normalizedEventType: lifecycleType,
    appId: body.appId ?? null,
    versionId: body.versionId ?? null,
    companyId: body.companyId ?? null,
    locationId,
    ghlUserId: body.userId ?? null,
    installType: body.installType ?? null,
    hasCompanyId: Boolean(body.companyId),
  });

  if (lifecycleType) {
    try {
      const result = await persistGhlMarketplaceLifecycleEvent(body);
      if (result.kind === "ignored") {
        logGhlOAuthDiagnostic("webhook_lifecycle_ignored", {
          eventType: type,
          normalizedEventType: lifecycleType,
          locationId,
          companyId: body.companyId ?? null,
          appId: body.appId ?? null,
        });
      }
      if (result.warning) {
        logGhlOAuthDiagnostic("webhook_lifecycle_warning", {
          eventType: lifecycleType,
          locationId,
          warning: result.warning,
          kind: result.kind,
        });
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error("[LeadConnector Webhook] Lifecycle processing error:", error instanceof Error ? error.message : "error");
      return res.status(500).json({ error: "Webhook processing error" });
    }
  }

  if (type === "UNKNOWN" || String(type).toUpperCase().includes("INSTALL") || String(type).toUpperCase().includes("PLAN")) {
    logGhlOAuthDiagnostic("webhook_unrecognized_lifecycle_event", {
      eventType: type,
      locationId,
      companyId: body.companyId ?? null,
      appId: body.appId ?? null,
    });
  }

  res.status(200).json({ received: true });

  try {
    // Contact and conversation events: verified, then processed after ack.
    // AppInstall / Uninstall / PlanChange / payment are handled above before ack.

    const ghlIntegrations = await storage.getIntegrationsByType('gohighlevel');
    const integration = ghlIntegrations.find(
      (i: any) => i.config && (i.config as any).locationId === locationId
    );

    if (!integration) {
      console.log(`[LeadConnector Webhook] ${timestamp} | No integration found for location: ${locationId}`);
      return;
    }

    const isNew = await storage.checkAndRecordGhlEvent(integration.id, eventId || `${type}-${timestamp}`, type);
    if (!isNew) {
      console.log(`[LeadConnector Webhook] ${timestamp} | Event already processed: ${eventId}`);
      return;
    }

    const userId = (integration as any).userId;

    switch (type) {
      case 'ContactCreate':
      case 'ContactUpdate': {
        // POLICY: ContactCreate/ContactUpdate events ONLY update existing CRM contacts.
        // New contacts are NEVER created from ContactCreate webhooks — only InboundMessage
        // events (actual conversations) should bring new contacts into the CRM.
        // This prevents bulk GHL contact databases from flooding the inbox.
        try {
          const contact = body.contact || body;
          const ghlId = contact.id || contact.contactId;
          const incomingPhone: string | undefined = contact.phone || undefined;
          const incomingEmail: string | undefined = contact.email || undefined;
          const name = contact.firstName && contact.lastName
            ? `${contact.firstName} ${contact.lastName}`
            : contact.firstName || incomingEmail || 'Unknown';

          const allContacts = await loadContactsForIdentityMatch(userId);

          const existingContact =
            (ghlId ? allContacts.find((c: any) => c.ghlId === ghlId) : undefined) ??
            (incomingPhone ? allContacts.find((c: any) => c.phone && c.phone === incomingPhone) : undefined) ??
            (incomingEmail ? allContacts.find((c: any) => c.email && c.email === incomingEmail) : undefined);

          if (existingContact) {
            if (isEmailInboxIdentitySource(existingContact.source)) {
              console.log(`[LeadConnector Webhook] ${timestamp} | ${type} skipped — matched Inbox identity, not a CRM Contact`);
            } else {
            const sourceDetailsBase = existingContact.sourceDetails
              ? (typeof existingContact.sourceDetails === 'string'
                  ? JSON.parse(existingContact.sourceDetails)
                  : existingContact.sourceDetails)
              : {};
            await storage.updateContact(existingContact.id, {
              name,
              ...(incomingEmail ? { email: incomingEmail } : {}),
              ...(incomingPhone ? { phone: incomingPhone } : {}),
              ...(ghlId && !existingContact.ghlId ? { ghlId } : {}),
              tag: contact.tags?.[0] || existingContact.tag,
              sourceDetails: JSON.stringify({
                ...sourceDetailsBase,
                customFields: contact.customFields,
                allTags: contact.tags,
              }),
            });
            scheduleHubSpotAutoSync(userId, existingContact.id);
            console.log(`[LeadConnector Webhook] ${timestamp} | Updated existing contact: ${ghlId || incomingPhone || incomingEmail}`);
            }
          } else {
            // Contact does not exist locally — skip creation.
            // Contacts only enter the CRM via InboundMessage events (real conversations).
            console.log(`[LeadConnector Webhook] ${timestamp} | ${type} skipped — contact not in CRM (ghlId: ${ghlId || 'none'}). Contacts created by InboundMessage only.`);
          }
        } catch (contactErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing contact:`, contactErr);
        }
        break;
      }

      case 'ContactTagUpdate': {
        try {
          const ghlId = body.contactId || body.contact?.id;
          const tags = body.tags || body.contact?.tags;
          
          if (ghlId && tags) {
            const contacts = await loadContactsForIdentityMatch(userId);
            const existingContact = contacts.find((c: any) => c.ghlId === ghlId);
            if (existingContact) {
              await storage.updateContact(existingContact.id, {
                tag: tags[0] || existingContact.tag,
                sourceDetails: JSON.stringify({
                  ...(existingContact.sourceDetails ? JSON.parse(existingContact.sourceDetails as any) : {}),
                  allTags: tags,
                }),
              });
              scheduleHubSpotAutoSync(userId, existingContact.id);
              console.log(`[LeadConnector Webhook] ${timestamp} | Updated tags for contact: ${ghlId}`);
            }
          }
        } catch (tagErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing tag update:`, tagErr);
        }
        break;
      }

      case 'InboundMessage': {
        try {
          const msg = body.message || body;
          const ghlContactId = msg.contactId || msg.contact?.id;
          const conversationId = msg.conversationId || msg.conversation?.id;
          const msgPhone: string | undefined = msg.contact?.phone || undefined;
          const msgEmail: string | undefined = msg.contact?.email || undefined;

          if (!ghlContactId) {
            console.log(`[LeadConnector Webhook] ${timestamp} | Missing contactId for InboundMessage`);
            break;
          }

          // Phase 1 safe match: ghlId → phone → email → create (no duplicates)
          const allContacts = await loadContactsForIdentityMatch(userId);
          let contact =
            allContacts.find((c: any) => c.ghlId === ghlContactId) ??
            (msgPhone ? allContacts.find((c: any) => c.phone && c.phone === msgPhone) : undefined) ??
            (msgEmail ? allContacts.find((c: any) => c.email && c.email === msgEmail) : undefined);

          if (!contact) {
            contact = await storage.createContact({
              userId,
              name: msg.contactName || msg.contact?.firstName || 'Unknown',
              phone: msgPhone,
              email: msgEmail,
              primaryChannel: 'gohighlevel',
              ghlId: ghlContactId,
              source: 'gohighlevel',
            });
          } else {
            contact = await promoteInboxIdentityOnGhlMatch(contact);
            if (!contact.ghlId) {
              await storage.updateContact(contact.id, { ghlId: ghlContactId });
            }
          }

          // Phase 7: Dedup by externalMessageId — GHL can echo outbound messages
          // back as OutboundMessage events or retry InboundMessage events. Skip
          // creation if this exact message ID has already been stored.
          if (msg.messageId) {
            const existing = await storage.getMessageByUserExternalId(userId, msg.messageId);
            if (existing) {
              logGhlDuplicateIgnored(msg.messageId);
              break;
            }
          }

          let conversation = await storage.getConversationByContactAndChannel(contact.id, 'gohighlevel');
          if (!conversation) {
            conversation = await storage.createConversation({
              userId,
              contactId: contact.id,
              channel: 'gohighlevel',
              externalThreadId: conversationId,
              status: 'open',
            });
          }

          try {
            await storage.createMessage({
              conversationId: conversation.id,
              contactId: contact.id,
              userId,
              direction: 'inbound',
              content: msg.content || msg.messageText || '',
              contentType: msg.contentType || 'text',
              externalMessageId: msg.messageId,
            });
          } catch (err: unknown) {
            if (msg.messageId && isUniqueExternalMessageViolation(err)) {
              logGhlDuplicateIgnored(msg.messageId);
              break;
            }
            throw err;
          }
          
          console.log(`[LeadConnector Webhook] ${timestamp} | Created message for contact: ${ghlContactId}`);
          scheduleHubSpotAutoSync(userId, contact.id);
        } catch (msgErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing message:`, msgErr);
        }
        break;
      }

      case 'AppointmentCreate': {
        try {
          const apt = body.appointment || body;
          const ghlContactId = apt.contactId || apt.contact?.id;
          
          if (ghlContactId) {
            const contacts = await loadContactsForIdentityMatch(userId);
            const contact = contacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              await storage.createActivityEvent({
                userId,
                contactId: contact.id,
                eventType: 'appointment_created',
                eventData: {
                  ghlAppointmentId: apt.id,
                  title: apt.title,
                  startTime: apt.startTime,
                  status: apt.status,
                } as any,
              });
              console.log(`[LeadConnector Webhook] ${timestamp} | Logged appointment for contact: ${ghlContactId}`);
            }
          }
        } catch (aptErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing appointment:`, aptErr);
        }
        break;
      }

      case 'ContactDelete': {
        // Phase 1 soft-delete: tag contact as deleted_in_ghl; never hard-delete
        try {
          const ghlId = body.contactId || body.contact?.id || body.id;
          if (ghlId) {
            const allContacts = await loadContactsForIdentityMatch(userId);
            const target = allContacts.find((c: any) => c.ghlId === ghlId);
            if (target) {
              await storage.updateContact(target.id, { tag: 'deleted_in_ghl' });
              scheduleHubSpotAutoSync(userId, target.id);
              console.log(`[LeadConnector Webhook] ${timestamp} | Soft-deleted contact: ${ghlId}`);
            }
          }
        } catch (delErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error soft-deleting contact:`, delErr);
        }
        break;
      }

      case 'AppointmentUpdate':
      case 'AppointmentDelete': {
        // Update existing appointment_created activity event with new status/outcome
        try {
          const apt = body.appointment || body;
          const ghlContactId = apt.contactId || apt.contact?.id;
          const appointmentId = apt.id || apt.appointmentId;
          if (ghlContactId && appointmentId) {
            const allContacts = await loadContactsForIdentityMatch(userId);
            const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              await storage.createActivityEvent({
                userId,
                contactId: contact.id,
                eventType: type === 'AppointmentDelete' ? 'appointment_deleted' : 'appointment_updated',
                eventData: {
                  ghlAppointmentId: appointmentId,
                  title: apt.title,
                  startTime: apt.startTime,
                  status: apt.status || (type === 'AppointmentDelete' ? 'deleted' : 'updated'),
                } as any,
              });
              console.log(`[LeadConnector Webhook] ${timestamp} | Logged ${type} for contact: ${ghlContactId}`);
            }
          }
        } catch (aptErr) {
          console.error(`[LeadConnector Webhook] ${timestamp} | Error processing ${type}:`, aptErr);
        }
        break;
      }

      case 'ContactDndUpdate':
        console.log(`[LeadConnector Webhook] ${timestamp} | Event acknowledged (not synced): ContactDndUpdate`);
        break;

      // ── Phase 2: Inbound GHL opportunity/pipeline sync ─────────────────────
      case 'OpportunityCreate':
      case 'OpportunityUpdate':
      case 'OpportunityStageUpdate':
      case 'OpportunityStatusUpdate': {
        try {
          const opp = body.opportunity || body;
          const ghlContactId: string | undefined =
            opp.contact?.id || opp.contactId || undefined;
          if (!ghlContactId) {
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — no contactId, skipping`,
            );
            break;
          }

          // Determine CRM stage:
          // 1. Terminal status override (won/lost/abandoned) takes precedence
          // 2. Else map GHL stage name explicitly
          const ghlStatus: string | undefined = opp.status;
          const ghlStageName: string | undefined = opp.stage?.name;
          const ghlOpportunityId: string | undefined = opp.id;

          let crmStage: string | undefined;
          if (ghlStatus && GHL_STATUS_TO_CRM_STAGE[ghlStatus]) {
            crmStage = GHL_STATUS_TO_CRM_STAGE[ghlStatus];
          } else if (ghlStageName) {
            const mapped = GHL_TO_CRM_STAGE_MAP[ghlStageName];
            if (!mapped) {
              console.warn(
                `[LeadConnector Webhook] ${timestamp} | ${type} — unmapped GHL stage "${ghlStageName}" — pipelineStage not updated`,
              );
            } else {
              crmStage = mapped;
            }
          }

          // Find the WhachatCRM contact by ghlId
          const allContacts = await loadContactsForIdentityMatch(userId);
          const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
          if (!contact) {
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — no local contact with ghlId="${ghlContactId}", skipping`,
            );
            break;
          }

          // Build update payload
          const updatePayload: Record<string, any> = {};
          if (crmStage) updatePayload.pipelineStage = crmStage;

          // Always keep ghlOpportunityId in sync on the contact's customFields
          if (ghlOpportunityId) {
            const existingCustomFields =
              contact.customFields && typeof contact.customFields === 'object'
                ? (contact.customFields as Record<string, any>)
                : {};
            if (existingCustomFields.ghlOpportunityId !== ghlOpportunityId) {
              updatePayload.customFields = {
                ...existingCustomFields,
                ghlOpportunityId,
              };
            }
          }

          if (Object.keys(updatePayload).length > 0) {
            // Call storage directly — never through API route (loop prevention)
            await storage.updateContact(contact.id, updatePayload);
            scheduleHubSpotAutoSync(userId, contact.id);
            console.log(
              `[LeadConnector Webhook] ${timestamp} | ${type} — contact "${contact.id}" ` +
              `${crmStage ? `stage → "${crmStage}"` : '(no stage change)'}, ` +
              `opportunityId=${ghlOpportunityId ?? 'n/a'}`,
            );
          }
        } catch (e) {
          console.error(`[LeadConnector Webhook] ${timestamp} | ${type} error:`, e);
        }
        break;
      }

      case 'OpportunityDelete': {
        try {
          const opp = body.opportunity || body;
          const ghlContactId: string | undefined =
            opp.contact?.id || opp.contactId || undefined;
          const ghlOpportunityId: string | undefined = opp.id;
          if (ghlContactId) {
            const allContacts = await loadContactsForIdentityMatch(userId);
            const contact = allContacts.find((c: any) => c.ghlId === ghlContactId);
            if (contact) {
              // Log as activity — do NOT change pipelineStage
              await storage.createActivityEvent({
                userId,
                contactId: contact.id,
                eventType: "opportunity_deleted",
                eventData: {
                  description: `CRM opportunity deleted (id: ${ghlOpportunityId ?? "unknown"})`,
                  ghlOpportunityId,
                },
                actorType: "system",
              });
              console.log(
                `[LeadConnector Webhook] ${timestamp} | OpportunityDelete — activity logged for contact "${contact.id}"`,
              );
            }
          }
        } catch (e) {
          console.error(`[LeadConnector Webhook] ${timestamp} | OpportunityDelete error:`, e);
        }
        break;
      }

      case 'OutboundMessage':
      case 'ConversationUnreadUpdate':
      case 'ConversationProviderUpdate':
      case 'NoteCreate':
      case 'NoteUpdate':
      case 'NoteDelete':
      case 'TaskCreate':
      case 'TaskUpdate':
      case 'TaskDelete':
      case 'TaskCompleted':
        console.log(`[LeadConnector Webhook] ${timestamp} | Event acknowledged (not yet synced): ${type}`);
        break;

      case 'AppInstall':
      case 'INSTALL':
      case 'AppUninstall':
      case 'UNINSTALL':
        break;

      default:
        console.log(`[LeadConnector Webhook] ${timestamp} | Unhandled event type: ${type}`);
    }
  } catch (error) {
    console.error(`[LeadConnector Webhook] ${timestamp} | Webhook processing error:`, error);
  }
}

router.post('/refresh-token', async (req: Request, res: Response) => {
  try {
    const { integrationId } = req.body;

    if (!integrationId) {
      return res.status(400).json({ error: 'Missing integrationId' });
    }

    const integration = await storage.getIntegration(integrationId);
    if (!integration || integration.type !== 'gohighlevel') {
      return res.status(404).json({ error: 'Integration not found' });
    }

    if (!integration.refreshToken) {
      return res.status(400).json({ error: 'No refresh token available' });
    }

    const params = new URLSearchParams({
      client_id: GHL_CLIENT_ID,
      client_secret: GHL_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: integration.refreshToken,
    });

    const tokenResponse = await fetch(GHL_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json() as any;

    if (!tokenResponse.ok) {
      console.error('[LeadConnector] Token refresh failed:', tokenData);
      return res.status(400).json({ error: 'Failed to refresh token' });
    }

    const tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in || 86400) * 1000);

    await storage.updateIntegration(integrationId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenExpiresAt,
      lastSyncAt: new Date(),
    });

    console.log('[LeadConnector] Token refreshed for integration:', integrationId);
    res.json({ success: true, expiresAt: tokenExpiresAt });
  } catch (error) {
    console.error('[LeadConnector] Token refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh token' });
  }
});

router.get('/connection-diagnostics', async (req: Request, res: Response) => {
  try {
    const recoveryContext = await resolveGhlOAuthRecoveryContext(req);
    if (!recoveryContext) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { userId: sessionUserId, user, sessionIsAdmin, recoveryAllowlistEligible, canAccessRecoveryTools } =
      recoveryContext;

    const summary = await summarizeGhlConnectionState();
    const userIntegrations = await storage.getIntegrations(sessionUserId);
    const userGhl = userIntegrations.filter((i) => i.type === "gohighlevel");

    const response: Record<string, unknown> = {
      ...summary,
      marketplaceBilling: {
        ...ghlMarketplacePlanConfigReadiness(),
        ...ghlWebhookSignatureReadiness(),
        canonicalWebhookPath: "/api/ext/webhook",
        aliasWebhookPath: "/api/ghl/webhook",
      },
      currentSession: {
        userId: sessionUserId,
        email: user?.email ?? null,
        sessionIsAdmin,
        recoveryAllowlistEligible,
        canAccessRecoveryTools,
        sessionIsAdminSource:
          "session.isAdmin is set only by POST /api/admin/login (Sales Admin), not regular WhachatCRM login",
        gohighlevelIntegrationCount: userGhl.length,
        connectedWithToken: userGhl.filter((i) => i.isActive && i.accessToken).length,
        locations: userGhl.map((i) => ({
          integrationId: i.id,
          isActive: i.isActive,
          hasAccessToken: Boolean(i.accessToken),
          locationId: ((i.config || {}) as Record<string, unknown>).locationId ?? null,
          companyId: ((i.config || {}) as Record<string, unknown>).companyId ?? null,
        })),
      },
    };

    if (canAccessRecoveryTools) {
      const eligibility = await evaluateUnlinkedOAuthRecoveryEligibility({
        userId: sessionUserId,
        userEmail: user?.email,
        sessionIsAdmin,
        recoveryAllowlistEligible,
      });
      response.oauthRecoveryDiagnostics = {
        unlinkedOauthInstalls: eligibility,
        recoverableCount: eligibility.filter((row) => row.finalRecoverable).length,
        recoveryAllowedEmails: process.env.GHL_OAUTH_RECOVERY_ALLOWED_EMAILS
          ? "GHL_OAUTH_RECOVERY_ALLOWED_EMAILS + PROSPECT_IMPORT_ALLOWED_EMAILS"
          : "PROSPECT_IMPORT_ALLOWED_EMAILS (default YaBa allowlist)",
      };
    } else {
      response.oauthRecoveryDiagnostics = {
        error: "Recovery diagnostics require Sales Admin session or recovery allowlisted email",
        sessionIsAdmin,
        recoveryAllowlistEligible,
      };
    }

    res.json(response);
  } catch (error) {
    console.error("[LeadConnector] connection-diagnostics error:", error);
    res.status(500).json({ error: "Failed to load connection diagnostics" });
  }
});

router.get('/connection-status', async (req: Request, res: Response) => {
  try {
    const userId = resolveSessionUserId(req);
    if (!userId) {
      return res.json({
        connected: false,
        installedInGhlNotConnected: false,
        connectionState: "not_connected",
        recoverableOAuthInstalls: 0,
      });
    }

    const queryLocationId = req.query.locationId as string | undefined;
    const tryRecover =
      req.query.tryRecover === '1' ||
      req.query.tryRecover === 'true' ||
      req.query.recover === '1' ||
      req.query.recover === 'true';
    const user = await storage.getUser(userId);
    const oauthPending = Boolean((req as any).session?.ghlMarketplaceInstallPending);

    const claim = await claimGhlOAuthHandoffIfPresent(req, res, userId);
    if (claim?.claimed) {
      clearGhlOAuthPending(req);
    }

    if (tryRecover) {
      logGhlOAuthDiagnostic('oauth_recovery_attempted', {
        userId,
        source: 'connection_status',
        isPlatformAdmin: false,
        recoveryAllowlistEligible: false,
        customerFacing: true,
      });
      const recovery = await recoverGhlOAuthFromMarketplaceInstall({
        userId,
        userEmail: user?.email,
        isPlatformAdmin: false,
        isRecoveryAllowlisted: false,
      });
      if (recovery.recovered) {
        clearGhlOAuthPending(req);
      }
    }

    const status = await resolveUserGhlConnectionStatus(userId, user?.email, {
      oauthPending,
      queryLocationId,
      isPlatformAdmin: false,
      isRecoveryAllowlisted: false,
    });

    res.json({
      connected: status.connected,
      tokenExpired: status.tokenExpired,
      installedInGhlNotConnected: status.installedInGhlNotConnected,
      connectionState: status.connectionState,
      recoverableOAuthInstalls: status.recoverableOAuthInstalls,
      canAccessCrmDiagnostics: canAccessGhlOAuthRecoveryTools(user, readSessionForRecovery(req)),
      locationId: status.locationId,
      companyId: status.companyId,
      installedAt: status.installedAt,
      lastSyncAt: status.lastSyncAt,
    });
  } catch (error) {
    console.error('[LeadConnector] Connection status check error:', error);
    res.json({
      connected: false,
      installedInGhlNotConnected: false,
      connectionState: "not_connected",
      recoverableOAuthInstalls: 0,
    });
  }
});

// ── Admin: Disable all GHL integrations for a user ───────────────────────────
// POST /api/ext/admin/disable-ghl-integrations
// Protected: must be authenticated as the target user OR provide GHL_ADMIN_KEY header
router.post('/admin/disable-ghl-integrations', async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req as any).session?.userId || (req as any).user?.id;
    const adminKey = req.headers['x-ghl-admin-key'];
    const { userId } = req.body;

    const isAdminKey = adminKey && adminKey === process.env.GHL_ADMIN_KEY;
    const isSelf = sessionUserId && sessionUserId === userId;

    if (!isAdminKey && !isSelf) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetUserId = userId || sessionUserId;
    if (!targetUserId) return res.status(400).json({ error: 'Missing userId' });

    const userIntegrations = await storage.getIntegrations(targetUserId);
    const ghlIntegrations = userIntegrations.filter((i: any) => i.type === 'gohighlevel');

    let disabled = 0;
    for (const integration of ghlIntegrations) {
      await storage.updateIntegration(integration.id, { isActive: false });
      disabled++;
    }

    console.log(`[GHL Admin] Disabled ${disabled} GHL integrations for user: ${targetUserId}`);
    return res.json({ success: true, disabled, integrationIds: ghlIntegrations.map((i: any) => i.id) });
  } catch (err) {
    console.error('[GHL Admin] Error disabling integrations:', err);
    return res.status(500).json({ error: 'Failed to disable integrations' });
  }
});

// ── Admin: Clean up GHL-imported contacts ─────────────────────────────────────
// POST /api/ext/admin/cleanup-ghl-contacts
// Protected: must be authenticated as the target user OR provide GHL_ADMIN_KEY header
// mode=no_messages  → delete only GHL contacts with zero messages (safe)
// mode=all_ghl      → delete ALL GHL-source contacts (use with care)
router.post('/admin/cleanup-ghl-contacts', async (req: Request, res: Response) => {
  try {
    const sessionUserId = (req as any).session?.userId || (req as any).user?.id;
    const adminKey = req.headers['x-ghl-admin-key'];
    const { userId, mode = 'no_messages' } = req.body;

    const isAdminKey = adminKey && adminKey === process.env.GHL_ADMIN_KEY;
    const isSelf = sessionUserId && sessionUserId === userId;

    if (!isAdminKey && !isSelf) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const targetUserId = userId || sessionUserId;
    if (!targetUserId) return res.status(400).json({ error: 'Missing userId' });

    // Fetch all GHL contacts for user
    const allGhlContacts = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, targetUserId), eq(contacts.source, 'gohighlevel')));

    if (allGhlContacts.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No CRM contacts found' });
    }

    const allGhlContactIds = allGhlContacts.map(c => c.id);

    let toDeleteIds: string[] = [];

    if (mode === 'no_messages') {
      // Only delete contacts that have no GHL conversations with actual messages
      const convWithMessages = await db
        .select({ contactId: conversations.contactId })
        .from(conversations)
        .where(
          and(
            inArray(conversations.contactId, allGhlContactIds),
            eq(conversations.channel, 'gohighlevel')
          )
        );

      const contactIdsWithConvs = new Set(convWithMessages.map(c => c.contactId));
      toDeleteIds = allGhlContactIds.filter(id => !contactIdsWithConvs.has(id));
    } else if (mode === 'all_ghl') {
      toDeleteIds = allGhlContactIds;
    } else {
      return res.status(400).json({ error: 'Invalid mode. Use no_messages or all_ghl' });
    }

    if (toDeleteIds.length === 0) {
      return res.json({ success: true, deleted: 0, message: 'No contacts matched the deletion criteria' });
    }

    // Delete in batches of 500 to avoid query size limits (cascade deletes conversations/messages)
    let deleted = 0;
    const BATCH = 500;
    for (let i = 0; i < toDeleteIds.length; i += BATCH) {
      const batch = toDeleteIds.slice(i, i + BATCH);
      await db.delete(contacts).where(inArray(contacts.id, batch));
      deleted += batch.length;
    }

    console.log(`[GHL Admin] Cleaned up ${deleted} GHL contacts (mode=${mode}) for user: ${targetUserId}`);
    return res.json({ success: true, deleted, mode, total_ghl: allGhlContacts.length, remaining: allGhlContacts.length - deleted });
  } catch (err) {
    console.error('[GHL Admin] Error cleaning up contacts:', err);
    return res.status(500).json({ error: 'Failed to clean up contacts' });
  }
});

export default router;
