/**
 * READ-ONLY: which env key material decrypts marketing / workspace mailboxes.
 * Never prints secret values, plaintext tokens, or full ciphertext.
 * Run: npx tsx scripts/audit-email-key-candidates.ts
 */
import "dotenv/config";
import { createHash, createDecipheriv, scryptSync } from "node:crypto";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "../drizzle/db";
import { emailMailboxes } from "../shared/schema";
import { resolveProspectImportDestinationUserId } from "../server/prospectImport/prospectImportService";
import {
  emailEncryptionKeySourceDiag,
  resolveEncryptionKeyMaterial,
} from "../server/emailChannel/credentials";

const CANDIDATES = [
  "EMAIL_ENCRYPTION_KEY",
  "META_ENCRYPTION_KEY",
  "TWILIO_ENCRYPTION_KEY",
  "SESSION_SECRET",
] as const;

function fingerprint(name: string) {
  const raw = process.env[name];
  if (raw == null || !String(raw).trim()) {
    return {
      present: false,
      emptyString: raw === "",
      length: null as number | null,
      sha256Prefix8: null as string | null,
      looksMalformed: false,
    };
  }
  const trimmed = String(raw).trim();
  const looksMalformed =
    /change.?me|your.?key|todo|xxx|placeholder|example|default-encryption-key/i.test(
      trimmed,
    ) || trimmed.length < 16;
  return {
    present: true,
    emptyString: false,
    length: trimmed.length,
    sha256Prefix8: createHash("sha256").update(trimmed, "utf8").digest("hex").slice(0, 8),
    looksMalformed,
  };
}

function tryDecryptWithMaterial(
  ciphertext: string,
  material: string,
): { ok: boolean; errorClass: string | null } {
  try {
    const parts = String(ciphertext || "").split(":");
    if (parts.length !== 3 || parts[0].length !== 32) {
      return { ok: false, errorClass: "bad_ciphertext_format" };
    }
    const [ivHex, authTagHex, encrypted] = parts;
    const key = scryptSync(material, "email-channel-salt", 32);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"), {
      authTagLength: 16,
    });
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let out = decipher.update(encrypted, "hex", "utf8");
    out += decipher.final("utf8");
    if (!out) return { ok: false, errorClass: "empty_plaintext" };
    return { ok: true, errorClass: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/unable to authenticate data|Unsupported state/i.test(msg)) {
      return { ok: false, errorClass: "auth_tag_mismatch" };
    }
    return { ok: false, errorClass: "other_decrypt_error" };
  }
}

async function main() {
  const wid = await resolveProspectImportDestinationUserId();
  const envPresence = Object.fromEntries(CANDIDATES.map((n) => [n, fingerprint(n)]));

  const fpPairs: Array<{ a: string; b: string; sameFingerprint: boolean | null }> = [];
  for (let i = 0; i < CANDIDATES.length; i++) {
    for (let j = i + 1; j < CANDIDATES.length; j++) {
      const a = CANDIDATES[i]!;
      const b = CANDIDATES[j]!;
      const fa = envPresence[a]!;
      const fb = envPresence[b]!;
      fpPairs.push({
        a,
        b,
        sameFingerprint:
          fa.present && fb.present ? fa.sha256Prefix8 === fb.sha256Prefix8 : null,
      });
    }
  }

  const rows = await db
    .select()
    .from(emailMailboxes)
    .where(
      or(
        eq(emailMailboxes.workspaceUserId, wid),
        ilike(emailMailboxes.emailAddress, "%marketing@whachatcrm.com%"),
        ilike(emailMailboxes.emailAddress, "%whachatcrm.com%"),
      ),
    );

  // Dedupe by id
  const byId = new Map(rows.map((r) => [r.id, r]));
  const mailboxes = [...byId.values()];

  const results = mailboxes.map((m) => {
    const fieldResults: Record<string, unknown> = {};
    for (const field of ["accessTokenEncrypted", "refreshTokenEncrypted"] as const) {
      const cipher = m[field];
      const label = field === "accessTokenEncrypted" ? "access_token" : "refresh_token";
      if (!cipher) {
        fieldResults[label] = { present: false };
        continue;
      }
      const byCandidate: Record<string, { ok: boolean; errorClass: string | null }> = {};
      const winners: string[] = [];
      for (const name of CANDIDATES) {
        const raw = String(process.env[name] || "").trim();
        if (!raw) {
          byCandidate[name] = { ok: false, errorClass: "env_absent" };
          continue;
        }
        const attempt = tryDecryptWithMaterial(cipher, raw);
        byCandidate[name] = attempt;
        if (attempt.ok) winners.push(name);
      }
      fieldResults[label] = {
        present: true,
        cipherLen: cipher.length,
        ivPrefix8: cipher.slice(0, 8),
        winners,
        byCandidate,
      };
    }
    return {
      idPrefix: m.id.slice(0, 8),
      email: m.emailAddress,
      isPrimary: m.isPrimary,
      syncStatus: m.syncStatus,
      workspaceIdPrefix: m.workspaceUserId.slice(0, 8),
      createdAt: m.createdAt?.toISOString() ?? null,
      updatedAt: m.updatedAt?.toISOString() ?? null,
      fields: fieldResults,
    };
  });

  const marketing = results.filter((m) =>
    /marketing@whachatcrm\.com/i.test(m.email || ""),
  );
  const marketingWinners = new Set<string>();
  for (const m of marketing) {
    for (const label of ["access_token", "refresh_token"] as const) {
      const fr = m.fields[label] as { winners?: string[] } | undefined;
      for (const w of fr?.winners || []) marketingWinners.add(w);
    }
  }

  let recoveryHint: string;
  if (marketingWinners.has("EMAIL_ENCRYPTION_KEY")) {
    recoveryHint =
      "marketing_decrypts_with_EMAIL_ENCRYPTION_KEY — set that same value on all Railway services";
  } else if (marketingWinners.has("SESSION_SECRET")) {
    recoveryHint =
      "marketing_decrypts_with_SESSION_SECRET_only — safest temporary fix is set EMAIL_ENCRYPTION_KEY equal to current SESSION_SECRET on all instances, then reconnect later to migrate";
  } else if (marketingWinners.has("META_ENCRYPTION_KEY") || marketingWinners.has("TWILIO_ENCRYPTION_KEY")) {
    recoveryHint =
      "marketing_decrypts_with_legacy_META_or_TWILIO_key — copy that exact material into EMAIL_ENCRYPTION_KEY on all instances";
  } else if (marketing.length === 0) {
    recoveryHint = "marketing_mailbox_not_found_in_db_from_this_env";
  } else {
    recoveryHint =
      "no_local_candidate_decrypts_marketing — Railway key material differs from this machine; check Railway EmailCryptoBoot keyFp8 and compare across replicas";
  }

  const runtimeDiag = emailEncryptionKeySourceDiag();
  let runtimeMaterialPresent = false;
  try {
    runtimeMaterialPresent = Boolean(resolveEncryptionKeyMaterial());
  } catch {
    runtimeMaterialPresent = false;
  }

  console.log(
    JSON.stringify(
      {
        note: "READ-ONLY. Fingerprints/sha256 prefixes only — never secrets or tokens. Local env ≠ Railway unless DATABASE_URL points at prod and env vars were copied.",
        process: {
          nodeEnv: process.env.NODE_ENV || null,
          runtimeKeySourceDiag: runtimeDiag,
          runtimeResolveHasMaterial: runtimeMaterialPresent,
        },
        envPresence,
        fingerprintEquality: fpPairs.filter((p) => p.sameFingerprint !== null),
        campaignWorkspaceIdPrefix: wid.slice(0, 8),
        mailboxCount: results.length,
        marketingMailboxCount: marketing.length,
        marketingDecryptWinners: [...marketingWinners],
        mailboxes: results,
        recoveryHint,
        railwayChecklist: [
          "In Railway logs search EmailCryptoBoot — note keySource + keyFp8 per replica",
          "All web/worker replicas must share identical keySource and keyFp8",
          "Variable to set: EMAIL_ENCRYPTION_KEY (identical on every service that runs the Node app)",
          "Do not set a brand-new random EMAIL_ENCRYPTION_KEY until you know old ciphertext is unrecoverable — that forces Gmail reconnect",
          "Redeploy/restart required after env change so all instances pick up the value",
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
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
