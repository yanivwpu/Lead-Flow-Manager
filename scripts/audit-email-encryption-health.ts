/**
 * READ-ONLY diagnostics for EmailCredentialDecryptError.
 * Never prints secret values, plaintext tokens, or full ciphertext.
 * Run: npx tsx scripts/audit-email-encryption-health.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "../drizzle/db";
import { emailMailboxes } from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { isEmailMailboxSyncStatusSendable } from "../shared/emailMailboxAvailability";
import {
  EMAIL_CREDENTIAL_DECRYPT_USER_MESSAGE,
  decryptEmailCredentialField,
  isEmailCredentialDecryptFailure,
} from "../server/emailChannel/credentials";

function fingerprintEnv(name: string): {
  present: boolean;
  length: number | null;
  sha256Prefix8: string | null;
  looksLikePlaceholder: boolean;
} {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === "") {
    return { present: false, length: null, sha256Prefix8: null, looksLikePlaceholder: false };
  }
  const trimmed = String(raw).trim();
  const looksLikePlaceholder =
    /change.?me|your.?key|todo|xxx|placeholder|example|default-encryption-key/i.test(trimmed) ||
    trimmed.length < 16;
  return {
    present: true,
    length: trimmed.length,
    sha256Prefix8: createHash("sha256").update(trimmed, "utf8").digest("hex").slice(0, 8),
    looksLikePlaceholder,
  };
}

function resolveKeySource(): {
  source: string | null;
  fingerprint: ReturnType<typeof fingerprintEnv> | null;
} {
  const order = [
    "EMAIL_ENCRYPTION_KEY",
    "META_ENCRYPTION_KEY",
    "TWILIO_ENCRYPTION_KEY",
    "SESSION_SECRET",
  ] as const;
  for (const name of order) {
    const fp = fingerprintEnv(name);
    if (fp.present) return { source: name, fingerprint: fp };
  }
  return { source: null, fingerprint: null };
}

async function main() {
  const emailKey = fingerprintEnv("EMAIL_ENCRYPTION_KEY");
  const metaKey = fingerprintEnv("META_ENCRYPTION_KEY");
  const twilioKey = fingerprintEnv("TWILIO_ENCRYPTION_KEY");
  const sessionKey = fingerprintEnv("SESSION_SECRET");
  const effective = resolveKeySource();

  const sameAsEmail =
    emailKey.present &&
    metaKey.present &&
    emailKey.sha256Prefix8 === metaKey.sha256Prefix8;

  const wid = await resolveProspectImportDestinationUserId();
  const rows = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid));

  const mailboxes = [];
  for (const m of rows) {
    let decryptAccess: Record<string, unknown> = { attempted: false };
    let decryptRefresh: Record<string, unknown> = { attempted: false };

    const accessCipher = m.accessTokenEncrypted;
    const refreshCipher = m.refreshTokenEncrypted;

    if (accessCipher) {
      decryptAccess = { attempted: true };
      try {
        const plain = decryptEmailCredentialField(accessCipher, "access_token", {
          mailboxId: m.id,
          workspaceId: m.workspaceUserId,
          stage: "audit_decrypt_access",
          syncStatus: m.syncStatus,
          lastSyncAt: m.lastSyncAt,
          hasRefreshToken: Boolean(refreshCipher),
        });
        decryptAccess = {
          attempted: true,
          ok: true,
          plaintextLength: plain.length,
        };
      } catch (err) {
        decryptAccess = {
          attempted: true,
          ok: false,
          isDecryptFailure: isEmailCredentialDecryptFailure(err),
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 180),
          matchesUserFacingDecryptMessage:
            err instanceof Error && err.message === EMAIL_CREDENTIAL_DECRYPT_USER_MESSAGE,
        };
      }
    } else {
      decryptAccess = { attempted: false, ok: false, reason: "no_access_ciphertext" };
    }

    if (refreshCipher) {
      decryptRefresh = { attempted: true };
      try {
        const plain = decryptEmailCredentialField(refreshCipher, "refresh_token", {
          mailboxId: m.id,
          workspaceId: m.workspaceUserId,
          stage: "audit_decrypt_refresh",
          syncStatus: m.syncStatus,
          lastSyncAt: m.lastSyncAt,
          hasRefreshToken: true,
        });
        decryptRefresh = {
          attempted: true,
          ok: true,
          plaintextLength: plain.length,
        };
      } catch (err) {
        decryptRefresh = {
          attempted: true,
          ok: false,
          isDecryptFailure: isEmailCredentialDecryptFailure(err),
          errorName: err instanceof Error ? err.name : typeof err,
          errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 180),
        };
      }
    } else {
      decryptRefresh = { attempted: false, ok: false, reason: "no_refresh_ciphertext" };
    }

    mailboxes.push({
      idPrefix: m.id.slice(0, 8),
      email: m.emailAddress,
      syncStatus: m.syncStatus,
      syncErrorPreview: m.syncError ? String(m.syncError).slice(0, 160) : null,
      isPrimary: m.isPrimary,
      sendableByStatusHelper: isEmailMailboxSyncStatusSendable(m.syncStatus),
      /** ChannelSettings green Connected pill uses syncStatus only — not live decrypt. */
      settingsShowsConnectedPill:
        m.syncStatus === "connected" || m.syncStatus === "syncing",
      settingsShowsNeedsAttention:
        m.syncStatus === "needs_reconnect" || m.syncStatus === "error",
      hasAccessCiphertext: Boolean(accessCipher),
      hasRefreshCiphertext: Boolean(refreshCipher),
      accessCipherLen: accessCipher ? accessCipher.length : 0,
      refreshCipherLen: refreshCipher ? refreshCipher.length : 0,
      /** Format prefix only (e.g. enc version) — not secret material */
      accessCipherPrefix: accessCipher ? accessCipher.slice(0, 8) : null,
      decryptAccess,
      decryptRefresh,
      tokenExpiresAt: m.tokenExpiresAt?.toISOString() || null,
      lastSyncAt: m.lastSyncAt?.toISOString() || null,
      createdAt: m.createdAt?.toISOString() || null,
      updatedAt: m.updatedAt?.toISOString() || null,
    });
  }

  const decryptOk = mailboxes.some(
    (m) => m.decryptAccess.ok === true || m.decryptRefresh.ok === true,
  );
  const decryptFail = mailboxes.some(
    (m) =>
      (m.hasAccessCiphertext && m.decryptAccess.ok === false) ||
      (m.hasRefreshCiphertext && m.decryptRefresh.ok === false),
  );

  let verdict: string;
  if (!effective.source) {
    verdict = "no_encryption_key_material_in_env";
  } else if (effective.fingerprint?.looksLikePlaceholder) {
    verdict = "effective_key_looks_like_placeholder";
  } else if (decryptFail && !decryptOk) {
    verdict = "ciphertext_present_current_effective_key_cannot_decrypt";
  } else if (decryptOk && !decryptFail) {
    verdict = "current_effective_key_decrypts_ok";
  } else if (decryptOk && decryptFail) {
    verdict = "mixed_decrypt_results_per_field_or_mailbox";
  } else {
    verdict = "no_ciphertext_or_inconclusive";
  }

  console.log(
    JSON.stringify(
      {
        note: "Fingerprints are sha256 prefixes only — not secrets. Ciphertext values are never printed.",
        process: {
          nodeEnv: process.env.NODE_ENV || null,
          cwdHash8: createHash("sha256").update(process.cwd(), "utf8").digest("hex").slice(0, 8),
        },
        keyResolutionOrder: [
          "EMAIL_ENCRYPTION_KEY",
          "META_ENCRYPTION_KEY",
          "TWILIO_ENCRYPTION_KEY",
          "SESSION_SECRET",
        ],
        envPresence: {
          EMAIL_ENCRYPTION_KEY: emailKey,
          META_ENCRYPTION_KEY: metaKey,
          TWILIO_ENCRYPTION_KEY: twilioKey,
          SESSION_SECRET: sessionKey,
        },
        effectiveKey: {
          source: effective.source,
          ...effective.fingerprint,
        },
        emailKeyEqualsMetaKey: sameAsEmail,
        campaignWorkspaceIdPrefix: wid.slice(0, 8),
        mailboxCount: mailboxes.length,
        mailboxes,
        verdict,
        settingsVsCampaign: {
          settingsConnectedUsesSyncStatusOnly: true,
          campaignSendRequiresLiveDecrypt: true,
          canShowConnectedWhileCampaignFails:
            "yes_if_syncStatus_is_connected_or_syncing_but_decrypt_fails_OR_stale_ui_cache",
        },
        recovery: {
          configOnlyLikely:
            verdict.includes("cannot_decrypt") ||
            verdict.includes("no_encryption_key") ||
            verdict.includes("placeholder"),
          existingCredentialsRecoverableWithoutReconnect:
            verdict === "current_effective_key_decrypts_ok",
          gmailReconnectRequiredIfPreviousKeyUnrecoverable:
            verdict === "ciphertext_present_current_effective_key_cannot_decrypt",
          whatToCheckInProduction: [
            "EMAIL_ENCRYPTION_KEY must be set identically on EVERY app instance/worker that runs campaign sends and Gmail OAuth",
            "If EMAIL_ENCRYPTION_KEY was rotated after Gmail connect, old ciphertext cannot be decrypted — reconnect Gmail after setting the intended key",
            "Avoid relying on SESSION_SECRET fallback for email in production — set EMAIL_ENCRYPTION_KEY explicitly",
            "Compare effectiveKey.sha256Prefix8 across web/API instances (must match)",
            "Do not wipe mailbox rows until key restoration is ruled out",
          ],
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
