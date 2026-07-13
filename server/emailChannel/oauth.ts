import crypto from "crypto";
import {
  EMAIL_DEFAULT_INITIAL_SYNC_MODE,
  EMAIL_SEND_DAILY_SOFT_CAP,
  EMAIL_SEND_HOURLY_SOFT_CAP,
  GMAIL_OAUTH_SCOPES,
  type EmailMailboxPublic,
  type EmailInitialSyncMode,
} from "@shared/emailChannel";
import {
  encryptEmailCredential,
  assertEmailEncryptionConfigured,
  decryptEmailCredentialField,
  EmailCredentialDecryptError,
  isEmailCredentialDecryptFailure,
  logEmailChannelHealthDiag,
  syncErrorFromUnknown,
} from "./credentials";
import { getEmailProvider } from "./gmailProvider";
import {
  countEmailMailboxes,
  insertEmailMailbox,
  saveOauthState,
  consumeOauthState,
  getPrimaryEmailMailbox,
  updateEmailMailbox,
  deleteEmailMailbox,
  getEmailMailboxById,
  setMailboxSyncStatus,
} from "./mailboxStore";
import { storage } from "../storage";
import {
  GmailOAuthDiagnosticError,
  categoryFromUnknownError,
  gmailOAuthErrorUiMessage,
  gmailOAuthErrorUiMessageFromDiagnostic,
  logGmailOAuthDiag,
} from "./gmailOAuthDiagnostic";

function getAppOrigin(): string {
  return String(process.env.APP_URL || "https://app.whachatcrm.com").replace(/\/+$/, "");
}

export function getGmailOAuthRedirectUri(): string {
  return (
    String(process.env.GMAIL_OAUTH_REDIRECT_URI || "").trim() ||
    `${getAppOrigin()}/api/integrations/email/gmail/callback`
  );
}

function pkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function startGmailOAuth(params: {
  workspaceUserId: string;
  connectedByUserId: string;
}): Promise<{ url: string }> {
  assertEmailEncryptionConfigured();
  const existing = await countEmailMailboxes(params.workspaceUserId);
  if (existing > 0) {
    throw new Error("Phase 1A supports one mailbox per workspace. Disconnect the existing mailbox first.");
  }

  const state = crypto.randomBytes(24).toString("hex");
  const { verifier, challenge } = pkce();
  const redirectUri = getGmailOAuthRedirectUri();
  await saveOauthState({
    state,
    workspaceUserId: params.workspaceUserId,
    connectedByUserId: params.connectedByUserId,
    codeVerifier: verifier,
    redirectUri,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  });

  const provider = getEmailProvider("gmail");
  const url = provider.getAuthorizationUrl({
    state,
    redirectUri,
    codeChallenge: challenge,
  });
  return { url };
}

export async function completeGmailOAuth(params: {
  code: string;
  state: string;
}): Promise<{ mailboxId: string; emailAddress: string }> {
  assertEmailEncryptionConfigured();
  const oauthState = await consumeOauthState(params.state);
  if (!oauthState) {
    throw new GmailOAuthDiagnosticError(
      "invalid_or_expired_oauth_state",
      "Invalid or expired OAuth state",
    );
  }

  const existing = await countEmailMailboxes(oauthState.workspaceUserId);
  if (existing > 0) {
    throw new GmailOAuthDiagnosticError(
      "mailbox_already_connected",
      "A mailbox is already connected for this workspace",
    );
  }

  const provider = getEmailProvider("gmail");
  const exchanged = await provider.exchangeAuthorizationCode({
    code: params.code,
    redirectUri: oauthState.redirectUri || getGmailOAuthRedirectUri(),
    codeVerifier: oauthState.codeVerifier || undefined,
  });

  if (!exchanged.refreshToken) {
    logGmailOAuthDiag("callback_failed", {
      category: "missing_refresh_token",
      hasAccessToken: !!exchanged.accessToken,
      hasRefreshToken: false,
      grantedScopes: exchanged.scopes ?? null,
    });
    throw new GmailOAuthDiagnosticError(
      "missing_refresh_token",
      "Google did not return a refresh token. Remove WhachatCRM access in Google Account permissions and reconnect with consent.",
    );
  }

  logGmailOAuthDiag("mailbox_persist_started", {
    workspaceUserId: oauthState.workspaceUserId,
    hasAccessToken: true,
    hasRefreshToken: true,
    grantedScopes: exchanged.scopes ?? null,
  });

  try {
    const syncFromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const mailbox = await insertEmailMailbox({
      workspaceUserId: oauthState.workspaceUserId,
      connectedByUserId: oauthState.connectedByUserId,
      provider: "gmail",
      emailAddress: exchanged.emailAddress,
      displayName: exchanged.displayName,
      providerAccountId: exchanged.providerAccountId,
      accessTokenEncrypted: encryptEmailCredential(exchanged.accessToken),
      refreshTokenEncrypted: encryptEmailCredential(exchanged.refreshToken),
      tokenExpiresAt: exchanged.expiresAt ?? null,
      scopes: exchanged.scopes || GMAIL_OAUTH_SCOPES.join(" "),
      syncStatus: "syncing",
      isPrimary: true,
      visibility: "workspace",
      syncFromDate,
      initialSyncMode: EMAIL_DEFAULT_INITIAL_SYNC_MODE,
    });

    await storage.upsertChannelSetting(oauthState.workspaceUserId, "email", {
      isConnected: true,
      isEnabled: true,
      config: {
        mailboxId: mailbox.id,
        emailAddress: mailbox.emailAddress,
        provider: "gmail",
      },
    });

    logGmailOAuthDiag("mailbox_persist_ok", {
      mailboxId: mailbox.id,
      syncStatus: "syncing",
    });

    // Fire-and-forget initial sync
    void import("./syncService")
      .then(({ runInitialEmailSync }) => runInitialEmailSync(mailbox.id))
      .catch((err) =>
        console.error(
          "[EmailOAuth] initial sync failed:",
          err instanceof Error ? err.message : String(err),
        ),
      );

    return { mailboxId: mailbox.id, emailAddress: mailbox.emailAddress };
  } catch (err) {
    if (err instanceof GmailOAuthDiagnosticError) throw err;
    logGmailOAuthDiag("mailbox_persist_failed", {
      message: err instanceof Error ? err.message.slice(0, 200) : "persist_failed",
    });
    throw new GmailOAuthDiagnosticError(
      "mailbox_persist_failed",
      err instanceof Error ? err.message : "Failed to save mailbox",
    );
  }
}

export function toGmailOAuthRedirectError(err: unknown): {
  category: ReturnType<typeof categoryFromUnknownError>;
  uiMessage: string;
} {
  const category = categoryFromUnknownError(err);
  const fallback = err instanceof Error ? err.message : "oauth_failed";
  const uiMessage =
    err instanceof GmailOAuthDiagnosticError
      ? gmailOAuthErrorUiMessageFromDiagnostic(err)
      : gmailOAuthErrorUiMessage(category, fallback);
  return {
    category,
    uiMessage,
  };
}

export async function getValidMailboxAccessToken(mailboxId: string): Promise<{
  accessToken: string;
  mailbox: NonNullable<Awaited<ReturnType<typeof getEmailMailboxById>>>;
}> {
  const mailbox = await getEmailMailboxById(mailboxId);
  if (!mailbox) throw new Error("Mailbox not found");

  const diagBase = {
    mailboxId: mailbox.id,
    workspaceId: mailbox.workspaceUserId,
    syncStatus: mailbox.syncStatus,
    lastSyncAt: mailbox.lastSyncAt,
    hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
  };

  let accessToken: string;
  try {
    accessToken = decryptEmailCredentialField(mailbox.accessTokenEncrypted, "access_token", {
      ...diagBase,
      stage: "token_read_access",
    });
  } catch (err) {
    if (isEmailCredentialDecryptFailure(err)) {
      await setMailboxSyncStatus(mailbox.id, "needs_reconnect", {
        syncError: syncErrorFromUnknown(err),
      });
    }
    throw err;
  }

  const expiresAt = mailbox.tokenExpiresAt?.getTime() ?? 0;
  const needsRefresh = !expiresAt || expiresAt < Date.now() + 60_000;

  if (needsRefresh) {
    if (!mailbox.refreshTokenEncrypted) {
      logEmailChannelHealthDiag({
        ...diagBase,
        stage: "token_refresh_missing_refresh",
        hasRefreshToken: false,
      });
      await setMailboxSyncStatus(mailbox.id, "needs_reconnect", {
        syncError: "Missing refresh token",
      });
      throw new Error("Mailbox needs reconnect");
    }
    let refreshToken: string;
    try {
      refreshToken = decryptEmailCredentialField(mailbox.refreshTokenEncrypted, "refresh_token", {
        ...diagBase,
        stage: "token_read_refresh",
      });
    } catch (err) {
      if (isEmailCredentialDecryptFailure(err)) {
        await setMailboxSyncStatus(mailbox.id, "needs_reconnect", {
          syncError: syncErrorFromUnknown(err),
        });
      }
      throw err;
    }
    const provider = getEmailProvider(mailbox.provider);
    try {
      const refreshed = await provider.refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await updateEmailMailbox(mailbox.id, {
        accessTokenEncrypted: encryptEmailCredential(refreshed.accessToken),
        tokenExpiresAt: refreshed.expiresAt ?? null,
        syncStatus: mailbox.syncStatus === "needs_reconnect" ? "connected" : mailbox.syncStatus,
        syncError: null,
      });
    } catch (err) {
      if (err instanceof EmailCredentialDecryptError) throw err;
      logEmailChannelHealthDiag({
        ...diagBase,
        stage: "token_refresh_provider",
        encryptedField: "refresh_token",
        error: err,
      });
      await setMailboxSyncStatus(mailbox.id, "needs_reconnect", {
        syncError: "Token refresh failed",
      });
      throw new Error("Mailbox needs reconnect");
    }
  }

  const fresh = (await getEmailMailboxById(mailboxId))!;
  return { accessToken, mailbox: fresh };
}

export async function disconnectEmailMailbox(params: {
  workspaceUserId: string;
  mailboxId: string;
}): Promise<void> {
  const mailbox = await getEmailMailboxById(params.mailboxId);
  if (!mailbox || mailbox.workspaceUserId !== params.workspaceUserId) {
    throw new Error("Mailbox not found");
  }
  await deleteEmailMailbox(mailbox.id);
  const remaining = await countEmailMailboxes(params.workspaceUserId);
  if (remaining === 0) {
    await storage.upsertChannelSetting(params.workspaceUserId, "email", {
      isConnected: false,
      isEnabled: false,
      config: {},
    });
  }
}

export function toPublicMailbox(
  m: NonNullable<Awaited<ReturnType<typeof getEmailMailboxById>>>,
): EmailMailboxPublic {
  return {
    id: m.id,
    provider: (m.provider as "gmail") || "gmail",
    emailAddress: m.emailAddress,
    displayName: m.displayName,
    syncStatus: m.syncStatus as EmailMailboxPublic["syncStatus"],
    syncError: m.syncError,
    lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
    syncProgressCurrent: m.syncProgressCurrent ?? 0,
    syncProgressTotal: m.syncProgressTotal ?? 0,
    isPrimary: m.isPrimary,
    initialSyncMode: (m.initialSyncMode as EmailInitialSyncMode) || EMAIL_DEFAULT_INITIAL_SYNC_MODE,
    connectedAt: m.createdAt?.toISOString() ?? null,
  };
}

/**
 * Settings health check: same credential path as sync/send.
 * Heals stale decrypt/sync errors when tokens still decrypt (and refresh if needed).
 * Does not overwrite a working mailbox with a blind reconnect.
 */
export async function getWorkspaceEmailStatus(workspaceUserId: string) {
  const mailbox = await getPrimaryEmailMailbox(workspaceUserId);
  if (!mailbox) {
    return { connected: false, mailbox: null as EmailMailboxPublic | null };
  }

  const stickyFailure =
    mailbox.syncStatus === "error" || mailbox.syncStatus === "needs_reconnect";

  try {
    await getValidMailboxAccessToken(mailbox.id);
    // Credentials readable on this instance — clear sticky Needs attention from a
    // prior poll/decrypt failure (e.g. another instance with a different key).
    if (stickyFailure) {
      logEmailChannelHealthDiag({
        mailboxId: mailbox.id,
        workspaceId: workspaceUserId,
        stage: "status_heal_credentials_ok",
        syncStatus: mailbox.syncStatus,
        lastSyncAt: mailbox.lastSyncAt,
        hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
      });
      await setMailboxSyncStatus(mailbox.id, "connected", { syncError: null });
    }
  } catch (err) {
    logEmailChannelHealthDiag({
      mailboxId: mailbox.id,
      workspaceId: workspaceUserId,
      stage: "status_probe_failed",
      encryptedField: err instanceof EmailCredentialDecryptError ? err.field : null,
      error: err,
      syncStatus: mailbox.syncStatus,
      lastSyncAt: mailbox.lastSyncAt,
      hasRefreshToken: Boolean(mailbox.refreshTokenEncrypted),
    });
    // Persist a user-safe message when the DB still has the raw OpenSSL string.
    const safe = syncErrorFromUnknown(err);
    if (
      isEmailCredentialDecryptFailure(err) &&
      (mailbox.syncError !== safe || !stickyFailure)
    ) {
      await setMailboxSyncStatus(mailbox.id, "needs_reconnect", { syncError: safe });
    }
  }

  const fresh = (await getPrimaryEmailMailbox(workspaceUserId))!;
  return { connected: true, mailbox: toPublicMailbox(fresh) };
}

export { EMAIL_SEND_DAILY_SOFT_CAP, EMAIL_SEND_HOURLY_SOFT_CAP };
