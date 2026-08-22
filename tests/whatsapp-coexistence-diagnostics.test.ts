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
import {
  buildSanitizedLastOAuthStatusFields,
  stripSensitiveWhatsAppFields,
} from "../server/whatsappStatusSanitize";

const VALID_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

describe("userMeta local bindings for encrypt helpers", () => {
  it("imports isEncrypted and decryptCredential into module scope (not re-export-only)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/userMeta.ts"), "utf8");
    // Must be a value import used by getMetaAccessToken â€” re-export-only caused ReferenceError in prod.
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
    assert.match(block, /buildSanitizedLastOAuthStatusFields/);
    assert.match(block, /oauthDiagnostics/);
    assert.match(block, /error:\s*["']Diagnostics failed["']/);
    assert.match(block, /\[CoexistenceDiagnostics\] error:/);
    assert.match(block, /requiredForCoexistence/);
    assert.match(block, /smb_message_echoes/);
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

  it("buildSanitizedLastOAuthStatusFields exposes only safe OAuth status fields", () => {
    const dirty = {
      phase: "code_exchange",
      flow: "coexistence",
      architecture: "v2",
      errorCode: "code_exchange_failed",
      exchangeFailureCategory: "redirect_uri_mismatch",
      discoveryFailureCategory: null,
      discoveryMethod: "v2_me_businesses_enumeration",
      codeCallbackReceived: true,
      sessionEventReceived: false,
      completeSdkAttempted: true,
      redirectUriSent: true,
      redirectUriUsed: "https://example.com/api/integrations/whatsapp/meta/callback",
      accessToken: "EAA.should.never.leak",
      authorization_code: "AQB.oauth.code.leak",
      code: "AQB.very.long.oauth.authorization.code.value.that.must.not.leak",
      META_ENCRYPTION_KEY: "should-not-appear",
      metaAccessToken: "v1:cipher:text:here",
      sessionEvent: { event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", wabaId: "123" },
      configId: "1111222233339682",
    };
    const cleanedDbg = stripSensitiveWhatsAppFields(dirty) as Record<string, unknown>;
    const status = buildSanitizedLastOAuthStatusFields(cleanedDbg);
    assert.equal(status.lastOAuthPhase, "code_exchange");
    assert.equal(status.lastOAuthFlow, "coexistence");
    assert.equal(status.lastOAuthArchitecture, "v2");
    assert.equal(status.lastOAuthErrorCode, "code_exchange_failed");
    assert.equal(status.exchangeFailureCategory, "redirect_uri_mismatch");
    assert.equal(status.codeCallbackReceived, true);
    assert.equal(status.sessionEventReceived, false);
    assert.equal(status.completeSdkAttempted, true);
    assert.equal(status.redirectUriSent, true);
    assert.equal(status.sessionEventName, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    const text = JSON.stringify(status);
    assert.doesNotMatch(text, /EAA\.should\.never\.leak/);
    assert.doesNotMatch(text, /AQB\.oauth\.code\.leak/);
    assert.doesNotMatch(text, /AQB\.very\.long\.oauth/);
    assert.doesNotMatch(text, /should-not-appear/);
    assert.doesNotMatch(text, /v1:cipher:text:here/);
    assert.doesNotMatch(text, /1111222233339682/);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "accessToken"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "authorization_code"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "code"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(status, "configId"), false);
  });
});
