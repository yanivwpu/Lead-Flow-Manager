/**
 * READ-ONLY: all mailboxes + heal/refresh timeline for decrypt re-rank.
 * No decrypt, no mutation, no resume.
 * Run: npx tsx scripts/audit-mailbox-decrypt-rerank.ts
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { emailMailboxes, prospectOutreachQueueItems, contacts } from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import { and, desc, ilike } from "drizzle-orm";

function fp(name: string) {
  const raw = process.env[name];
  if (raw == null || !String(raw).trim()) {
    return { present: false, length: null as number | null, sha256Prefix8: null as string | null };
  }
  const t = String(raw).trim();
  return {
    present: true,
    length: t.length,
    sha256Prefix8: createHash("sha256").update(t, "utf8").digest("hex").slice(0, 8),
  };
}

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const now = Date.now();

  const rows = await db
    .select()
    .from(emailMailboxes)
    .where(eq(emailMailboxes.workspaceUserId, wid))
    .orderBy(desc(emailMailboxes.isPrimary), desc(emailMailboxes.createdAt));

  const idea = await db
    .select({
      id: prospectOutreachQueueItems.id,
      lastError: prospectOutreachQueueItems.lastError,
      attempts: prospectOutreachQueueItems.attempts,
      senderMailboxId: prospectOutreachQueueItems.senderMailboxId,
      updatedAt: prospectOutreachQueueItems.updatedAt,
      sentAt: prospectOutreachQueueItems.sentAt,
      name: contacts.name,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .where(
      and(
        eq(prospectOutreachQueueItems.workspaceUserId, wid),
        ilike(contacts.name, "%idea%peddler%"),
      ),
    )
    .orderBy(desc(prospectOutreachQueueItems.updatedAt))
    .limit(1);

  const ideaFailAt = idea[0]?.updatedAt?.getTime() ?? null;
  const ideaMailboxId = idea[0]?.senderMailboxId ?? null;

  const mailboxes = rows.map((m) => {
    const access = m.accessTokenEncrypted || "";
    const refresh = m.refreshTokenEncrypted || "";
    const aParts = access.split(":");
    const rParts = refresh.split(":");
    const exp = m.tokenExpiresAt?.getTime() ?? null;
    const updatedAt = m.updatedAt?.getTime() ?? null;
    return {
      idPrefix: m.id.slice(0, 8),
      idMatchesIdeaSender: ideaMailboxId ? m.id === ideaMailboxId : null,
      email: m.emailAddress,
      isPrimary: m.isPrimary,
      syncStatus: m.syncStatus,
      syncErrorPreview: m.syncError ? String(m.syncError).slice(0, 120) : null,
      tokenExpiresAt: m.tokenExpiresAt?.toISOString() ?? null,
      /** If Google ~3600s, estimated refresh write time from current expires */
      estimatedLastAccessRefreshAt:
        exp != null ? new Date(exp - 3600_000).toISOString() : null,
      lastSyncAt: m.lastSyncAt?.toISOString() ?? null,
      createdAt: m.createdAt?.toISOString() ?? null,
      updatedAt: m.updatedAt?.toISOString() ?? null,
      msUpdatedAfterIdeaFail:
        ideaFailAt != null && updatedAt != null ? updatedAt - ideaFailAt : null,
      wouldNeedRefreshAtIdeaFail:
        ideaFailAt != null && exp != null ? exp < ideaFailAt + 60_000 : null,
      accessCipherLen: access.length,
      refreshCipherLen: refresh.length,
      accessFormatOk: aParts.length === 3 && aParts[0]?.length === 32,
      refreshFormatOk: !refresh || (rParts.length === 3 && rParts[0]?.length === 32),
      accessIvPrefix8: aParts[0]?.slice(0, 8) ?? null,
      refreshIvPrefix8: rParts[0]?.slice(0, 8) ?? null,
      /** Different IVs expected; same IV would be suspicious */
      accessAndRefreshShareIvPrefix:
        Boolean(aParts[0]) && aParts[0] === rParts[0],
    };
  });

  console.log(
    JSON.stringify(
      {
        note: "READ-ONLY. No ciphertext/secrets. Local env fingerprints ≠ Railway.",
        workspaceIdPrefix: wid.slice(0, 8),
        localEnvPresence: {
          EMAIL_ENCRYPTION_KEY: fp("EMAIL_ENCRYPTION_KEY"),
          META_ENCRYPTION_KEY: fp("META_ENCRYPTION_KEY"),
          TWILIO_ENCRYPTION_KEY: fp("TWILIO_ENCRYPTION_KEY"),
          SESSION_SECRET: fp("SESSION_SECRET"),
        },
        ideaPeddler: idea[0]
          ? {
              idPrefix: idea[0].id.slice(0, 8),
              name: idea[0].name,
              lastError: idea[0].lastError,
              attempts: idea[0].attempts,
              senderMailboxPrefix: idea[0].senderMailboxId?.slice(0, 8) ?? null,
              updatedAt: idea[0].updatedAt?.toISOString() ?? null,
            }
          : null,
        mailboxCount: mailboxes.length,
        mailboxes,
        writePathSummary: {
          accessTokenEncryptedWriters: [
            "oauth callback insertEmailMailbox (encryptEmailCredential)",
            "getValidMailboxAccessToken refresh updateEmailMailbox (encryptEmailCredential)",
          ],
          refreshTokenEncryptedWriters: [
            "oauth callback insertEmailMailbox (encryptEmailCredential) ONLY — refresh never rewritten on token refresh",
          ],
          keyResolution: [
            "EMAIL_ENCRYPTION_KEY",
            "META_ENCRYPTION_KEY",
            "TWILIO_ENCRYPTION_KEY",
            "SESSION_SECRET",
          ],
          salt: "email-channel-salt (NOT Meta/Twilio 'salt')",
          helpersNeverUsedForMailboxTokens: [
            "userMeta.encryptCredential",
            "userTwilio.encryptCredential",
          ],
        },
        healCandidatesAround1925: [
          "runIncrementalEmailSync success → updateEmailMailbox({syncStatus:connected, lastSyncAt}) — calls getValidMailboxAccessToken first (decrypt must succeed)",
          "getWorkspaceEmailStatus sticky heal → setMailboxSyncStatus(connected) after successful getValidMailboxAccessToken — status only, no token rewrite",
          "token refresh path would also set syncStatus connected and rewrite accessTokenEncrypted",
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
