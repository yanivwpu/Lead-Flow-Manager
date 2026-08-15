/**
 * Phase 1 public readiness: phone uniqueness, no silent v2 downgrade, dead routes, secret hygiene.
 * Run: npx tsx --test tests/whatsapp-v4-public-readiness.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  selectEmbeddedSignupArchitecture,
  evaluateEmbeddedSignupV4Prerequisites,
} from "../shared/whatsappEmbeddedSignupRollout";
import { resolveEmbeddedSignupConfigIdFromEnv } from "../shared/whatsappEmbeddedSignupVersion";
import { evaluateMetaWhatsAppReadiness } from "../shared/whatsappReadiness";
import {
  mapEmbeddedSignupFailureCategory,
  resolveEmbeddedSignupFailureCopy,
  EMBEDDED_SIGNUP_FAILURE_CATEGORIES,
} from "../shared/whatsappEmbeddedSignupFailures";
import { shouldAutoRedirectAfterSdkFailure } from "../client/src/lib/whatsappEmbeddedSignupCompletion";
import {
  isMetaPhoneNumberUniqueViolation,
  META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE,
} from "../server/userMeta";

const PREREQ = {
  META_APP_ID: "810621184995059",
  META_APP_SECRET: "test-meta-app-secret",
  META_WHATSAPP_REDIRECT_URI: "https://app.example.com/api/integrations/whatsapp/meta/callback",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-test",
  META_ENCRYPTION_KEY: "test-meta-encryption-key-32bytes!!",
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
  META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
  META_WHATSAPP_COEXISTENCE_CONFIG_ID: "coex-config-cccccccc",
  APP_URL: "https://app.example.com",
  WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "true",
  WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
};

describe("Standard v4 public selection", () => {
  it("normal non-admin + public rollout → v4 with v4 config only", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "public-user-123",
      sessionIsAdmin: false,
      env: PREREQ,
    });
    assert.equal(r.architecture, "v4");
    const cfg = resolveEmbeddedSignupConfigIdFromEnv("embedded", "v4", PREREQ as any);
    assert.equal(cfg.configId, PREREQ.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID);
    assert.notEqual(cfg.configId, PREREQ.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
    assert.notEqual(cfg.configId, PREREQ.META_WHATSAPP_COEXISTENCE_CONFIG_ID);
  });

  it("missing v4 config fails prerequisites safely", () => {
    const prereq = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "",
    } as any);
    assert.equal(prereq.ok, false);
    assert.ok(prereq.missing.includes("v4_config_id") || prereq.missing.length > 0);
  });
});

describe("redirect / SDK fallback cannot silently downgrade public v4", () => {
  it("pre-login failures may redirect (server selects architecture)", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v4",
        fbLoginInvoked: false,
        finishEventSeen: false,
        completeSdkAttempted: false,
      }),
      true,
    );
  });

  it("never redirects after FB.login / finish / complete-sdk", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v4",
        fbLoginInvoked: true,
        finishEventSeen: false,
        completeSdkAttempted: false,
      }),
      false,
    );
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v2",
        fbLoginInvoked: false,
        finishEventSeen: true,
        completeSdkAttempted: false,
      }),
      false,
    );
  });

  it("start-redirect uses server selection and rejects client architecture", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /Architecture cannot be selected by the client/);
    assert.doesNotMatch(src, /architecture:\s*"v2"/);
    assert.match(src, /startEmbeddedSignupSession\(req\.user\.id, "embedded"\)/);
  });
});

describe("phone uniqueness helpers", () => {
  it("detects unique violation constraint names", () => {
    assert.equal(
      isMetaPhoneNumberUniqueViolation({
        code: "23505",
        constraint: "users_meta_phone_number_id_uidx",
      }),
      true,
    );
    assert.equal(isMetaPhoneNumberUniqueViolation({ code: "23505", message: "other" }), false);
    assert.equal(isMetaPhoneNumberUniqueViolation({ code: "23503" }), false);
  });

  it("customer conflict copy does not expose other workspace identity", () => {
    assert.match(META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE, /already connected/i);
    assert.doesNotMatch(META_PHONE_NUMBER_WORKSPACE_CONFLICT_MESSAGE, /userId|email|workspace id/i);
  });

  it("migration 0078 creates unique partial index and duplicate preflight", () => {
    const sql = fs.readFileSync(
      path.join(process.cwd(), "migrations/0078_users_meta_phone_number_id_unique.sql"),
      "utf8",
    );
    assert.match(sql, /users_meta_phone_number_id_uidx/);
    assert.match(sql, /CREATE UNIQUE INDEX/i);
    assert.match(sql, /duplicate/i);
    assert.match(sql, /RAISE EXCEPTION/i);
    assert.match(sql, /WHERE meta_phone_number_id IS NOT NULL/i);
  });

  it("webhook routing fails closed on duplicate ownership", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/userMeta.ts"), "utf8");
    assert.match(src, /CRITICAL inbound routing blocked/);
    assert.match(src, /return undefined/);
    assert.doesNotMatch(src, /using the first match/);
  });
});

describe("readiness honesty", () => {
  it("saved without webhook ≠ fully Connected", () => {
    const r = evaluateMetaWhatsAppReadiness({
      whatsappProvider: "meta",
      metaConnected: true,
      metaBusinessAccountId: "111111111111111",
      metaPhoneNumberId: "222222222222222",
      metaWebhookSubscribed: false,
      metaIntegrationStatus: "connected",
    });
    assert.equal(r.setupIncomplete, true);
    assert.equal(r.fullyReady, false);
  });

  it("Graph phone not ready ≠ fully Connected", () => {
    const r = evaluateMetaWhatsAppReadiness(
      {
        whatsappProvider: "meta",
        metaConnected: true,
        metaBusinessAccountId: "111111111111111",
        metaPhoneNumberId: "222222222222222",
        metaWebhookSubscribed: true,
        metaIntegrationStatus: "connected",
      },
      { phoneGraphStatus: "PENDING", phoneGraphCodeVerification: "NOT_VERIFIED", phoneGraphPlatformType: "CLOUD_API" },
    );
    assert.equal(r.fullyReady, false);
    assert.equal(r.setupIncomplete, true);
  });

  it("operational connection → ready", () => {
    const r = evaluateMetaWhatsAppReadiness(
      {
        whatsappProvider: "meta",
        metaConnected: true,
        metaBusinessAccountId: "111111111111111",
        metaPhoneNumberId: "222222222222222",
        metaWebhookSubscribed: true,
        metaIntegrationStatus: "connected",
      },
      { phoneGraphStatus: "CONNECTED", phoneGraphCodeVerification: "VERIFIED", phoneGraphPlatformType: "CLOUD_API" },
    );
    assert.equal(r.fullyReady, true);
  });
});

describe("security surfaces", () => {
  it("start__disabled and complete-sdk__disabled hard-fail", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /start__disabled[\s\S]*?status\(404\)/);
    assert.match(src, /complete-sdk__disabled[\s\S]*?status\(404\)/);
    assert.doesNotMatch(src, /start__disabled[\s\S]*?startEmbeddedSignupSession\(req\.user\.id, parsed\.data\.flow\)/);
  });

  it("startup logs never print META_APP_SECRET prefix", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/index.ts"), "utf8");
    assert.doesNotMatch(src, /META_APP_SECRET.*prefix=/);
    assert.doesNotMatch(src, /metaAppSecretForStartupLog\.slice/);
    assert.match(src, /metaAppSecretConfigured/);
  });

  it("public config nulls full Meta config IDs", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(src, /embeddedSignupConfigId:\s*null/);
    assert.match(src, /embeddedSignupV4ConfigId:\s*null/);
    assert.match(src, /coexistenceConfigId:\s*null/);
  });

  it("live start blocks unauthorized coexistence (server gate)", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /COEXISTENCE_COMING_SOON_MESSAGE|COEXISTENCE_UNAVAILABLE_MESSAGE/);
    assert.match(src, /evaluateCoexistenceOnboardingGate/);
  });
});

describe("customer-facing error quality", () => {
  it("covers popup, conflict, and cancel categories", () => {
    assert.equal(mapEmbeddedSignupFailureCategory("popup_blocked"), "sdk_launch_failed");
    assert.equal(mapEmbeddedSignupFailureCategory("phone_workspace_conflict"), "phone_workspace_conflict");
    assert.equal(mapEmbeddedSignupFailureCategory("dialog_cancelled"), "dialog_cancelled");
    const popup = resolveEmbeddedSignupFailureCopy("sdk_launch_failed");
    assert.match(popup.message, /pop-ups/i);
    const conflict = resolveEmbeddedSignupFailureCopy("phone_workspace_conflict");
    assert.match(conflict.message, /already connected/i);
    assert.ok(EMBEDDED_SIGNUP_FAILURE_CATEGORIES.includes("sdk_launch_failed"));
  });
});
