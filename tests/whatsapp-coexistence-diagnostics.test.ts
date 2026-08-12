/**
 * Coexistence diagnostics + Meta encrypt detection wiring.
 * Run: npx tsx --test tests/whatsapp-coexistence-diagnostics.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  classifyStoredMetaCredentialEncryption,
  isMetaCredentialEncryptionConfigured,
  isMetaEncryptedCredential,
  isVersionedMetaCiphertext,
  isLegacyMetaCiphertext,
} from "../shared/metaCredentialEncryption";
import {
  encryptCredential,
  encryptMetaCredentialWithLegacyFallbackForTests,
  isEncrypted,
} from "../server/metaCredentialCrypto";
import { stripSensitiveWhatsAppFields } from "../server/whatsappStatusSanitize";

const VALID_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe("userMeta local bindings for encrypt helpers", () => {
  it("imports isEncrypted and decryptCredential into module scope (not re-export-only)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/userMeta.ts"), "utf8");
    // Must be a value import used by getMetaAccessToken — re-export-only caused ReferenceError in prod.
    assert.match(
      src,
      /import\s*\{[^}]*\bisEncrypted\b[^}]*\}\s*from\s*["']\.\/metaCredentialCrypto["']/,
    );
    assert.match(
      src,
      /import\s*\{[^}]*\bdecryptCredential\b[^}]*\}\s*from\s*["']\.\/metaCredentialCrypto["']/,
    );
    assert.match(src, /getMetaAccessToken[\s\S]*isEncrypted\(/);
  });
});

describe("canonical Meta encryption detection helpers", () => {
  it("detects v1 and legacy unversioned ciphertext; plaintext is not encrypted", () => {
    const env = { META_ENCRYPTION_KEY: VALID_KEY } as NodeJS.ProcessEnv;
    const v1 = encryptCredential("EAA.token.v1", env);
    const legacy = encryptMetaCredentialWithLegacyFallbackForTests("EAA.token.legacy");
    assert.equal(isEncrypted(v1), true);
    assert.equal(isMetaEncryptedCredential(v1), true);
    assert.equal(isVersionedMetaCiphertext(v1), true);
    assert.equal(classifyStoredMetaCredentialEncryption(v1), "v1");

    assert.equal(isEncrypted(legacy), true);
    assert.equal(isLegacyMetaCiphertext(legacy), true);
    assert.equal(classifyStoredMetaCredentialEncryption(legacy), "legacy_unversioned");

    assert.equal(isEncrypted("EAA.plaintext.token"), false);
    assert.equal(classifyStoredMetaCredentialEncryption("EAA.plaintext.token"), "plaintext_or_unknown");
    assert.equal(classifyStoredMetaCredentialEncryption(null), "missing");
  });

  it("isMetaCredentialEncryptionConfigured is true for valid META_ENCRYPTION_KEY", () => {
    assert.equal(
      isMetaCredentialEncryptionConfigured({ META_ENCRYPTION_KEY: VALID_KEY }),
      true,
    );
  });
});

describe("coexistence-diagnostics route safety", () => {
  it("route uses canonical isEncrypted / classify helpers and does not throw ReferenceError patterns", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    const start = src.indexOf('/api/integrations/whatsapp/coexistence-diagnostics');
    assert.ok(start >= 0);
    const end = src.indexOf("app.post(\"/api/integrations/whatsapp/meta/start\"", start);
    const block = src.slice(start, end > start ? end : start + 40_000);
    assert.match(block, /isEncrypted/);
    assert.match(block, /classifyStoredMetaCredentialEncryption/);
    assert.match(block, /isMetaCredentialEncryptionConfigured/);
    assert.match(block, /metaEncryptionKeyConfigured/);
    assert.match(block, /v1DecryptReady/);
    assert.match(block, /accessTokenEncryptionStatus/);
    assert.match(block, /architectureStatus/);
    assert.match(block, /error:\s*["']Diagnostics failed["']/);
    assert.match(block, /\[CoexistenceDiagnostics\] error:/);
    assert.doesNotMatch(block, /json\(\{\s*error:\s*e\?\.message/);
  });

  it("stripSensitiveWhatsAppFields removes tokens/secrets from diagnostic-like payloads", () => {
    const secret = "super-secret-meta-encryption-key-value!!";
    const payload = {
      metaEncryptionKeyConfigured: true,
      v1DecryptReady: true,
      accessTokenEncryptionStatus: "v1",
      META_ENCRYPTION_KEY: secret,
      metaAccessToken: "v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:cccc",
      accessToken: "EAA.leak",
      metaAppSecret: "app-secret-leak",
      encryption: {
        metaEncryptionKeyConfigured: true,
        tokenStatus: "ok",
      },
    };
    const cleaned = stripSensitiveWhatsAppFields(payload) as Record<string, unknown>;
    const text = JSON.stringify(cleaned);
    assert.equal(cleaned.META_ENCRYPTION_KEY, undefined);
    assert.equal(cleaned.metaAccessToken, undefined);
    assert.equal(cleaned.accessToken, undefined);
    assert.equal(cleaned.metaAppSecret, undefined);
    assert.doesNotMatch(text, /super-secret-meta-encryption-key-value/);
    assert.doesNotMatch(text, /EAA\.leak/);
    assert.doesNotMatch(text, /app-secret-leak/);
    assert.equal((cleaned.encryption as any)?.metaEncryptionKeyConfigured, true);
  });
});
