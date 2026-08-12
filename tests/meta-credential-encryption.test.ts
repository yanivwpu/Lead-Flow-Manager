/**
 * Meta credential encryption versioning + legacy migration.
 * Run: npx tsx --test tests/meta-credential-encryption.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  META_CREDENTIAL_ENCRYPTION_VERSION,
  META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
  META_ENCRYPTION_KEY_MIN_LENGTH,
  isMetaCredentialEncryptionConfigured,
  isVersionedMetaCiphertext,
  isLegacyMetaCiphertext,
  validateMetaEncryptionKey,
} from "../shared/metaCredentialEncryption";
import {
  encryptCredential,
  decryptCredential,
  isEncrypted,
  encryptMetaCredentialWithLegacyFallbackForTests,
  encryptMetaCredentialUnversionedForTests,
  decryptMetaCredentialOrNull,
  migrateMetaCiphertextFieldForTests,
  listUnversionedMetaDecryptPassphrases,
  MetaCredentialEncryptionConfigError,
} from "../server/metaCredentialCrypto";
import {
  evaluateEmbeddedSignupV4Prerequisites,
  selectEmbeddedSignupArchitecture,
  buildSanitizedV4RolloutConfigSummary,
} from "../shared/whatsappEmbeddedSignupRollout";

const VALID_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="; // 44 chars base64-ish ≥32
const VALID_KEY_B = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=";
const SESSION_HIST = "historical-session-secret-material-32b!";
const PLAIN = "EAATestMetaAccessTokenValueDoNotLeak";

const PREREQ_BASE = {
  META_APP_ID: "810621184995059",
  META_APP_SECRET: "test-meta-app-secret",
  META_WHATSAPP_REDIRECT_URI: "https://app.example.com/api/integrations/whatsapp/meta/callback",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-test",
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
  META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
  APP_URL: "https://app.example.com",
  WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
  WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
};

describe("META_ENCRYPTION_KEY validation", () => {
  it("requires length ≥ 32 and rejects legacy default", () => {
    assert.equal(validateMetaEncryptionKey("").ok, false);
    assert.equal(validateMetaEncryptionKey("short").ok, false);
    assert.equal(
      validateMetaEncryptionKey(META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE).ok,
      false,
    );
    assert.equal(
      (validateMetaEncryptionKey(META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE) as any).reason,
      "legacy_default_forbidden",
    );
    assert.ok(VALID_KEY.length >= META_ENCRYPTION_KEY_MIN_LENGTH);
    assert.equal(validateMetaEncryptionKey(VALID_KEY).ok, true);
  });

  it("readiness ignores SESSION_SECRET, EMAIL_ENCRYPTION_KEY, and legacy default", () => {
    assert.equal(
      isMetaCredentialEncryptionConfigured({
        SESSION_SECRET: "session-secret-long-enough-for-32b!!",
        EMAIL_ENCRYPTION_KEY: "email-encryption-key-long-enough!!",
        META_ENCRYPTION_KEY: "",
      }),
      false,
    );
    assert.equal(
      isMetaCredentialEncryptionConfigured({
        META_ENCRYPTION_KEY: META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
      }),
      false,
    );
    assert.equal(
      isMetaCredentialEncryptionConfigured({ META_ENCRYPTION_KEY: VALID_KEY }),
      true,
    );
  });

  it("unversioned decrypt passphrase list is bounded and deduplicated", () => {
    const list = listUnversionedMetaDecryptPassphrases({
      META_ENCRYPTION_KEY: VALID_KEY,
      SESSION_SECRET: VALID_KEY, // same as meta → one entry
      EMAIL_ENCRYPTION_KEY: "email-must-never-appear-in-meta-list!!!!",
    } as NodeJS.ProcessEnv);
    assert.deepEqual(list, [VALID_KEY, META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE]);
    assert.equal(list.includes("email-must-never-appear-in-meta-list!!!!"), false);
  });
});

describe("unversioned historical sources decrypt", () => {
  it("decrypts unversioned ciphertext created with META_ENCRYPTION_KEY", () => {
    const ct = encryptMetaCredentialUnversionedForTests(PLAIN, VALID_KEY);
    assert.equal(isLegacyMetaCiphertext(ct), true);
    const env = {
      META_ENCRYPTION_KEY: VALID_KEY,
      SESSION_SECRET: SESSION_HIST,
    } as NodeJS.ProcessEnv;
    assert.equal(decryptMetaCredentialOrNull(ct, env), PLAIN);
  });

  it("decrypts unversioned ciphertext created with historical SESSION_SECRET", () => {
    const ct = encryptMetaCredentialUnversionedForTests(PLAIN, SESSION_HIST);
    assert.equal(isLegacyMetaCiphertext(ct), true);
    const env = {
      META_ENCRYPTION_KEY: VALID_KEY,
      SESSION_SECRET: SESSION_HIST,
    } as NodeJS.ProcessEnv;
    assert.equal(decryptMetaCredentialOrNull(ct, env), PLAIN);
    // Without SESSION_SECRET configured, that historical ciphertext must not open via primary alone.
    assert.equal(
      decryptMetaCredentialOrNull(ct, { META_ENCRYPTION_KEY: VALID_KEY } as NodeJS.ProcessEnv),
      null,
    );
  });

  it("decrypts unversioned ciphertext created with hardcoded legacy default", () => {
    const ct = encryptMetaCredentialWithLegacyFallbackForTests(PLAIN);
    assert.equal(isLegacyMetaCiphertext(ct), true);
    const env = { META_ENCRYPTION_KEY: VALID_KEY } as NodeJS.ProcessEnv;
    assert.equal(decryptCredential(ct, env), PLAIN);
    assert.equal(decryptMetaCredentialOrNull(ct, env), PLAIN);
  });
});

describe("legacy decrypt + versioned encrypt", () => {
  it("new ciphertext uses only META_ENCRYPTION_KEY and is versioned", () => {
    const env = {
      META_ENCRYPTION_KEY: VALID_KEY,
      SESSION_SECRET: "session-must-not-be-used-for-new-writes!!!!",
      EMAIL_ENCRYPTION_KEY: "email-must-not-be-used-for-meta-writes!!!!",
    } as NodeJS.ProcessEnv;
    const enc = encryptCredential(PLAIN, env);
    assert.ok(enc.startsWith(`${META_CREDENTIAL_ENCRYPTION_VERSION}:`));
    assert.equal(isVersionedMetaCiphertext(enc), true);
    assert.equal(isEncrypted(enc), true);
    assert.equal(decryptCredential(enc, env), PLAIN);

    const wrong = decryptMetaCredentialOrNull(enc, {
      META_ENCRYPTION_KEY: VALID_KEY_B,
      SESSION_SECRET: "session-must-not-be-used-for-new-writes!!!!",
    } as NodeJS.ProcessEnv);
    assert.equal(wrong, null);
  });

  it("missing/invalid primary key blocks new writes", () => {
    assert.throws(
      () => encryptCredential(PLAIN, { META_ENCRYPTION_KEY: "" } as NodeJS.ProcessEnv),
      MetaCredentialEncryptionConfigError,
    );
    assert.throws(
      () =>
        encryptCredential(PLAIN, {
          META_ENCRYPTION_KEY: META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
          SESSION_SECRET: "session-secret-long-enough-for-32b!!",
        } as NodeJS.ProcessEnv),
      MetaCredentialEncryptionConfigError,
    );
    assert.throws(
      () =>
        encryptCredential(PLAIN, {
          SESSION_SECRET: "session-secret-long-enough-for-32b!!",
        } as NodeJS.ProcessEnv),
      /META_ENCRYPTION_KEY|not configured/i,
    );
  });

  it("legacy default never encrypts new data or satisfies readiness", () => {
    const env = {
      META_ENCRYPTION_KEY: META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
    } as NodeJS.ProcessEnv;
    assert.throws(() => encryptCredential(PLAIN, env), MetaCredentialEncryptionConfigError);
    assert.equal(isMetaCredentialEncryptionConfigured(env), false);
  });
});

describe("field migration (in-memory)", () => {
  it("re-encrypts each historical unversioned source to v1 with plaintext equivalence", () => {
    const env = {
      META_ENCRYPTION_KEY: VALID_KEY,
      SESSION_SECRET: SESSION_HIST,
    } as NodeJS.ProcessEnv;
    const sources = [
      encryptMetaCredentialUnversionedForTests(PLAIN, VALID_KEY),
      encryptMetaCredentialUnversionedForTests(PLAIN, SESSION_HIST),
      encryptMetaCredentialWithLegacyFallbackForTests(PLAIN),
    ];
    for (const legacy of sources) {
      const first = migrateMetaCiphertextFieldForTests(legacy, env);
      assert.equal(first.status, "migrated");
      assert.ok(first.next);
      assert.ok(isVersionedMetaCiphertext(first.next!));
      assert.equal(decryptCredential(first.next!, env), PLAIN);
      const second = migrateMetaCiphertextFieldForTests(first.next!, env);
      assert.equal(second.status, "already_versioned");
      assert.equal(second.next, first.next);
    }
  });

  it("wrong key cannot overwrite — failed migration returns null next", () => {
    const envGood = { META_ENCRYPTION_KEY: VALID_KEY } as NodeJS.ProcessEnv;
    const versioned = encryptCredential(PLAIN, envGood);
    const envWrong = { META_ENCRYPTION_KEY: VALID_KEY_B } as NodeJS.ProcessEnv;
    const r = migrateMetaCiphertextFieldForTests(versioned, envWrong);
    assert.equal(r.status, "already_versioned");
    assert.equal(r.next, versioned);
    assert.equal(decryptMetaCredentialOrNull(versioned, envWrong), null);
    assert.equal(decryptMetaCredentialOrNull(versioned, envGood), PLAIN);

    const failed = migrateMetaCiphertextFieldForTests(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:cccc",
      envGood,
    );
    assert.equal(failed.status, "failed");
    assert.equal(failed.next, null);
  });
});

describe("v4 readiness gated on META_ENCRYPTION_KEY only", () => {
  it("SESSION_SECRET / legacy default do not satisfy token_encryption; valid key does", () => {
    const missing = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ_BASE,
      META_ENCRYPTION_KEY: "",
      SESSION_SECRET: "session-secret-long-enough-for-32b!!",
      EMAIL_ENCRYPTION_KEY: "email-encryption-key-long-enough!!",
    });
    assert.equal(missing.diagnostics.tokenEncryptionConfigured, false);
    assert.ok(missing.missing.includes("token_encryption"));

    const legacyAsKey = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ_BASE,
      META_ENCRYPTION_KEY: META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE,
    });
    assert.equal(legacyAsKey.diagnostics.tokenEncryptionConfigured, false);
    assert.ok(legacyAsKey.missing.includes("token_encryption"));

    const ok = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ_BASE,
      META_ENCRYPTION_KEY: VALID_KEY,
    });
    assert.equal(ok.diagnostics.tokenEncryptionConfigured, true);
    assert.equal(ok.missing.includes("token_encryption"), false);

    const sel = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "u1",
      env: {
        ...PREREQ_BASE,
        META_ENCRYPTION_KEY: "",
        SESSION_SECRET: "session-secret-long-enough-for-32b!!",
      },
    });
    assert.equal(sel.architecture, "v2");
    assert.match(sel.reason, /token_encryption/);
  });

  it("sanitized diagnostics never include key material", () => {
    const secret = "super-secret-meta-encryption-key-value!!";
    const summary = buildSanitizedV4RolloutConfigSummary({
      ...PREREQ_BASE,
      META_ENCRYPTION_KEY: secret,
    });
    const text = JSON.stringify(summary);
    assert.doesNotMatch(text, /super-secret-meta-encryption-key-value/);
    assert.doesNotMatch(text, new RegExp(META_CREDENTIAL_LEGACY_FALLBACK_PASSPHRASE));
    assert.equal(typeof summary.prerequisites.diagnostics.tokenEncryptionConfigured, "boolean");
  });
});

describe("source guards — deployment safety", () => {
  it("migration is Sales Admin–gated, dry-run skips writes, reports remaining unversioned", () => {
    const routes = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
    const migrateIdx = routes.indexOf("/api/admin/meta-credential-encryption/migrate");
    assert.ok(migrateIdx >= 0);
    const migrateBlock = routes.slice(migrateIdx, migrateIdx + 1200);
    assert.match(migrateBlock, /requireAdmin/);
    assert.match(migrateBlock, /remainingUnversionedFields/);
    assert.match(migrateBlock, /legacyReadStillRequired/);
    assert.doesNotMatch(migrateBlock, /keySource|whichKey|passphraseSucceeded/);

    const cryptoSrc = fs.readFileSync(
      path.join(process.cwd(), "server/metaCredentialCrypto.ts"),
      "utf8",
    );
    assert.match(cryptoSrc, /if \(dryRun\) continue/);
    assert.match(cryptoSrc, /eq\(whatsappOauthStates\.userId, row\.userId\)/);
    assert.match(cryptoSrc, /remainingUnversionedFields/);
    assert.doesNotMatch(cryptoSrc, /Samantha|samantha/i);

    const index = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");
    assert.match(index, /logMetaCredentialEncryptionBootDiag/);
    assert.doesNotMatch(index, /migrateMetaCredentialEncryption/);

    const worker = fs.readFileSync(path.join(process.cwd(), "server/worker.ts"), "utf8");
    assert.match(worker, /logMetaCredentialEncryptionBootDiag/);
  });

  it("previous unversioned-only isEncrypted shape cannot treat v1 as encrypted (rollback proof)", () => {
    const env = { META_ENCRYPTION_KEY: VALID_KEY } as NodeJS.ProcessEnv;
    const v1 = encryptCredential(PLAIN, env);
    // Legacy detector used before this migration (3 segments only).
    const legacyIsEncrypted = (text: string) => {
      const parts = text.split(":");
      return parts.length === 3 && parts[0].length === 32;
    };
    assert.equal(legacyIsEncrypted(v1), false);
    assert.equal(isVersionedMetaCiphertext(v1), true);
  });

  it("does not use EMAIL_ENCRYPTION_KEY or SESSION_SECRET on write path", () => {
    const cryptoSrc = fs.readFileSync(
      path.join(process.cwd(), "server/metaCredentialCrypto.ts"),
      "utf8",
    );
    assert.match(cryptoSrc, /requirePrimaryPassphrase/);
    assert.match(cryptoSrc, /listUnversionedMetaDecryptPassphrases/);
  });
});
