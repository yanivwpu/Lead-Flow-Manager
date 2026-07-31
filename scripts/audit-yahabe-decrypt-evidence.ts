/**
 * READ-ONLY evidence for yahabegood decrypt failure.
 * Does not print secrets, plaintext tokens, or ciphertext bodies.
 * Does not mutate Railway / Gmail / DB.
 * Run: npx tsx scripts/audit-yahabe-decrypt-evidence.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  emailMailboxes,
  prospectOutreachQueueItems,
  prospectOutreachSettings,
} from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  emailEncryptionKeySourceDiag,
} from "../server/emailChannel/credentials";
import { parseSenderNotConnectedDiagnostic } from "../shared/prospectSenderProbeDiagnostics";

function fp(name: string) {
  const raw = process.env[name];
  if (raw == null) return { present: false, length: null as number | null, sha256Prefix8: null as string | null };
  const t = String(raw).trim();
  if (!t) return { present: false, length: 0, sha256Prefix8: null };
  return {
    present: true,
    length: t.length,
    sha256Prefix8: createHash("sha256").update(t, "utf8").digest("hex").slice(0, 8),
  };
}

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const localDiag = emailEncryptionKeySourceDiag();

  const mailboxes = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid));

  const yahabe = mailboxes.filter((m) => /yahabegood@gmail\.com/i.test(m.emailAddress || ""));
  const m = yahabe[0] || mailboxes.find((x) => x.isPrimary) || mailboxes[0];

  const settings = await db
    .select()
    .from(prospectOutreachSettings)
    .where(eq(prospectOutreachSettings.workspaceUserId, wid))
    .limit(1);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recent = m
    ? await db
        .select({
          id: prospectOutreachQueueItems.id,
          name: contacts.name,
          queueStatus: prospectOutreachQueueItems.queueStatus,
          lastError: prospectOutreachQueueItems.lastError,
          attempts: prospectOutreachQueueItems.attempts,
          sentAt: prospectOutreachQueueItems.sentAt,
          updatedAt: prospectOutreachQueueItems.updatedAt,
          senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
        })
        .from(prospectOutreachQueueItems)
        .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
        .where(
          and(
            eq(prospectOutreachQueueItems.workspaceUserId, wid),
            gte(prospectOutreachQueueItems.updatedAt, since),
          ),
        )
        .orderBy(desc(prospectOutreachQueueItems.updatedAt))
        .limit(40)
    : [];

  const decryptFails = recent.filter((r) =>
    /sender_not_connected:decrypt/i.test(String(r.lastError || "")),
  );
  const sent = recent.filter((r) => r.queueStatus === "sent" && r.sentAt);

  const access = m?.accessTokenEncrypted || "";
  const refresh = m?.refreshTokenEncrypted || "";
  const aParts = access.split(":");
  const rParts = refresh.split(":");

  console.log(
    JSON.stringify(
      {
        note: "DB + local process evidence only. Production keySource/keyFp8 must come from Railway [EmailChannelHealthDiag] / [EmailCryptoBoot] lines — this script does not invent them.",
        localProcessIsNotRailway: {
          nodeEnv: process.env.NODE_ENV || null,
          keyDiag: localDiag,
          EMAIL_ENCRYPTION_KEY: fp("EMAIL_ENCRYPTION_KEY"),
          SESSION_SECRET: { present: fp("SESSION_SECRET").present, sha256Prefix8: fp("SESSION_SECRET").sha256Prefix8 },
          warning:
            "Any EmailChannelHealthDiag emitted by this script reflects LOCAL env, not Railway. Discard for production keySource answers.",
        },
        workspaceIdPrefix: wid.slice(0, 8),
        queueSettings: settings[0]
          ? {
              paused: settings[0].paused,
              queueRunning: settings[0].queueRunning,
            }
          : null,
        mailbox: m
          ? {
              idPrefix: m.id.slice(0, 8),
              email: m.emailAddress,
              isPrimary: m.isPrimary,
              syncStatus: m.syncStatus,
              syncErrorPreview: m.syncError ? String(m.syncError).slice(0, 160) : null,
              createdAt: m.createdAt?.toISOString() ?? null,
              updatedAt: m.updatedAt?.toISOString() ?? null,
              lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
              tokenExpiresAt: m.tokenExpiresAt?.toISOString() ?? null,
              hasAccessCipher: Boolean(access),
              hasRefreshCipher: Boolean(refresh),
              accessFormatOk: aParts.length === 3 && aParts[0]?.length === 32,
              refreshFormatOk: !refresh || (rParts.length === 3 && rParts[0]?.length === 32),
              accessIvPrefix8: aParts[0]?.slice(0, 8) ?? null,
              refreshIvPrefix8: rParts[0]?.slice(0, 8) ?? null,
              accessCipherLen: access.length,
              refreshCipherLen: refresh.length,
            }
          : null,
        mailboxRowCount: mailboxes.length,
        last7d: {
          recentRowCount: recent.length,
          sentCount: sent.length,
          decryptFailCount: decryptFails.length,
          latestSent: sent[0]
            ? {
                name: sent[0].name,
                sentAt: sent[0].sentAt?.toISOString() ?? null,
                senderPrefix: sent[0].senderMailboxId?.slice(0, 8) ?? null,
              }
            : null,
          latestDecryptFail: decryptFails[0]
            ? {
                name: decryptFails[0].name,
                lastError: decryptFails[0].lastError,
                parsed: parseSenderNotConnectedDiagnostic(decryptFails[0].lastError),
                updatedAt: decryptFails[0].updatedAt?.toISOString() ?? null,
                attempts: decryptFails[0].attempts,
                senderPrefix: decryptFails[0].senderMailboxId?.slice(0, 8) ?? null,
                sameMailboxAsPrimary: m
                  ? decryptFails[0].senderMailboxId === m.id
                  : null,
              }
            : null,
          timelineSample: recent.slice(0, 12).map((r) => ({
            name: r.name,
            status: r.queueStatus,
            err: r.lastError,
            sentAt: r.sentAt?.toISOString() ?? null,
            updatedAt: r.updatedAt?.toISOString() ?? null,
          })),
        },
        interpretationRules: {
          aesGcmAuthFailureMeans:
            "A key was loaded and AES-GCM auth tag check failed — ciphertext was not produced under that exact key material (or was corrupted).",
          ifRailwayHasEmailKeyAndDiagShowsEmailKeyButAuthFails:
            "Stored credential is from different key material than current EMAIL_ENCRYPTION_KEY (old ciphertext / key rotation), not 'variable missing'.",
          ifDiagShowsSessionSecretOnRailwayWithEmailKeyConfigured:
            "That process is not loading EMAIL_ENCRYPTION_KEY (wrong service/env, empty override, or NODE_ENV path) — runtime loading issue.",
          reconnectSufficientWhen:
            "EMAIL_ENCRYPTION_KEY is stable and identical on all replicas; reconnect re-encrypts access+refresh under that current key.",
        },
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
