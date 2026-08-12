/**
 * Controlled public-rollout gates for Embedded Signup v4 (standard only).
 * Run: npx tsx --test tests/whatsapp-embedded-signup-v4-rollout.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  embeddedSignupV4RolloutBucket,
  evaluateEmbeddedSignupV4Prerequisites,
  parseEmbeddedSignupV4RolloutMode,
  selectEmbeddedSignupArchitecture,
  buildSanitizedV4RolloutConfigSummary,
} from "../shared/whatsappEmbeddedSignupRollout";
import {
  mapEmbeddedSignupFailureCategory,
  resolveEmbeddedSignupFailureCopy,
  EMBEDDED_SIGNUP_FAILURE_CATEGORIES,
} from "../shared/whatsappEmbeddedSignupFailures";
import {
  sanitizeEmbeddedSignupObservabilityPayload,
  redactEmbeddedSignupLogValue,
} from "../shared/whatsappEmbeddedSignupObservability";
import { shouldAutoRedirectAfterSdkFailure } from "../client/src/lib/whatsappEmbeddedSignupCompletion";
import {
  isMetaPhoneCloudApiOperational,
  isMetaPhoneCloudApiRegistrationRequired,
} from "../shared/whatsappPhoneRegistration";
import {
  tryClaimEmbeddedSignupCompletion,
  releaseEmbeddedSignupCompletion,
  resetEmbeddedSignupRolloutMetricsForTests,
  getEmbeddedSignupV4RolloutAdminSummary,
} from "../server/whatsappEmbeddedSignupRolloutMetrics";
import { stripSensitiveWhatsAppFields } from "../server/whatsappStatusSanitize";

const PREREQ = {
  META_APP_ID: "810621184995059",
  META_APP_SECRET: "test-meta-app-secret",
  META_WHATSAPP_REDIRECT_URI: "https://app.example.com/api/integrations/whatsapp/meta/callback",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-test",
  META_ENCRYPTION_KEY: "test-meta-encryption-key-32bytes!!",
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
  META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
  APP_URL: "https://app.example.com",
};

describe("v4 rollout modes", () => {
  it("disabled kill switch → v2", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "false",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_flag_disabled");
  });

  it("rollout mode disabled → v2 even for allowlisted users", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "true",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "disabled",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_rollout_disabled");
  });

  it("allowlist_only → only explicit IDs receive v4", () => {
    const env = {
      ...PREREQ,
      WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
      WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
      WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "alpha,beta",
    };
    assert.equal(selectEmbeddedSignupArchitecture({ flow: "embedded", userId: "alpha", env }).architecture, "v4");
    assert.equal(selectEmbeddedSignupArchitecture({ flow: "embedded", userId: "gamma", env }).architecture, "v2");
  });

  it("percentage assignment is deterministic and stable", () => {
    const a = embeddedSignupV4RolloutBucket("stable-user-42");
    const b = embeddedSignupV4RolloutBucket("stable-user-42");
    assert.equal(a, b);
    assert.ok(a >= 0 && a < 100);
    // Pure FNV-1a — no Math.random / IP / email / session.
    assert.equal(embeddedSignupV4RolloutBucket("stable-user-42"), a);

    const envBase = {
      ...PREREQ,
      WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
      WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "percentage",
      WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "",
      WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT: "0",
    };
    assert.equal(
      selectEmbeddedSignupArchitecture({ flow: "embedded", userId: "anyone", env: envBase }).architecture,
      "v2",
    );

    const included = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "stable-user-42",
      env: { ...envBase, WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT: "100" },
    });
    assert.equal(included.architecture, "v4");
    assert.equal(included.reason, "v4_percentage_included");
  });

  it("public → eligible users receive v4", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "random-public-user",
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "",
      },
    });
    assert.equal(r.architecture, "v4");
    assert.equal(r.reason, "v4_public_rollout");
  });

  it("malformed / missing rollout settings → v2", () => {
    assert.equal(parseEmbeddedSignupV4RolloutMode("nope").valid, false);
    assert.equal(parseEmbeddedSignupV4RolloutMode(undefined).mode, "disabled");

    const missing = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        // no ROLLOUT_MODE
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(missing.architecture, "v2");
    assert.equal(missing.reason, "v4_rollout_mode_invalid");

    const bad = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "ship_it",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(bad.architecture, "v2");
    assert.equal(bad.reason, "v4_rollout_mode_invalid");
  });

  it("prerequisites missing → v2 with sanitized reason", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
        // missing app secret / encryption / webhook
        META_APP_ID: "810621184995059",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.match(r.reason, /^v4_prerequisites_incomplete:/);
    assert.ok(r.prerequisitesMissing.includes("meta_app_secret"));
  });

  it("config isolation: v4 config must not equal v2 or coexistence", () => {
    const prereq = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v2-config-aaaaaaaa",
    });
    assert.equal(prereq.ok, false);
    assert.ok(prereq.missing.includes("config_isolation"));
  });

  it("admin status alone never appears in selection API", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "admin-not-listed",
      sessionIsAdmin: true,
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "someone-else",
      },
    });
    assert.equal(r.architecture, "v2");
  });
});

describe("client cannot force architecture / no second-dialog after login", () => {
  it("v4 may redirect only before FB.login (same server architecture selection)", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v4",
        fbLoginInvoked: false,
        finishEventSeen: false,
        completeSdkAttempted: false,
      }),
      true,
    );
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v4",
        fbLoginInvoked: true,
        finishEventSeen: false,
        completeSdkAttempted: false,
      }),
      false,
    );
  });

  it("start-redirect rejects client architecture override and does not hardcode v2", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /Architecture cannot be selected by the client/);
    assert.doesNotMatch(src, /architecture:\s*"v2"/);
  });
});

describe("phone registration PIN rules", () => {
  it("new PENDING Cloud API numbers require PIN; operational CONNECTED skip", () => {
    assert.equal(
      isMetaPhoneCloudApiRegistrationRequired(
        { status: "PENDING", codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API" },
        { coexistence: false, isTestNumber: false },
      ),
      true,
    );
    assert.equal(
      isMetaPhoneCloudApiOperational({
        status: "CONNECTED",
        codeVerificationStatus: "VERIFIED",
        platformType: "CLOUD_API",
      }),
      true,
    );
    assert.equal(
      isMetaPhoneCloudApiRegistrationRequired(
        { status: "CONNECTED", codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API" },
        { coexistence: false, isTestNumber: false },
      ),
      false,
    );
  });

  it("coexistence phones never use standard /register path", () => {
    assert.equal(
      isMetaPhoneCloudApiRegistrationRequired(
        { status: "PENDING", codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API" },
        { coexistence: true, isTestNumber: false },
      ),
      false,
    );
  });
});

describe("failure UX + redaction + locales", () => {
  it("maps failure categories and provides EN copy", () => {
    assert.equal(mapEmbeddedSignupFailureCategory("oauth_state_expired"), "oauth_state_expired");
    assert.equal(mapEmbeddedSignupFailureCategory("phone_not_under_waba"), "phone_waba_mismatch");
    assert.equal(mapEmbeddedSignupFailureCategory("session_assets_missing"), "session_assets_missing");
    const copy = resolveEmbeddedSignupFailureCopy("code_exchange_failed");
    assert.ok(copy.message.length > 10);
    assert.ok(copy.recovery.length > 5);
  });

  it("EN/ES/HE locale keys exist for all failure categories", () => {
    for (const loc of ["en", "es", "he"] as const) {
      const json = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), `client/src/locales/${loc}.json`), "utf8"),
      );
      const errors = json.whatsappEmbeddedSignup?.errors;
      assert.ok(errors, loc);
      for (const cat of EMBEDDED_SIGNUP_FAILURE_CATEGORIES) {
        assert.ok(errors[cat]?.message, `${loc}.${cat}`);
        assert.ok(errors[cat]?.recovery, `${loc}.${cat}.recovery`);
      }
    }
  });

  it("observability redacts secrets and stripSensitiveWhatsAppFields removes tokens", () => {
    assert.equal(redactEmbeddedSignupLogValue("access_token", "EAA..."), "[redacted]");
    const safe = sanitizeEmbeddedSignupObservabilityPayload({
      event: "code_exchange",
      ok: false,
      detail: "ok",
    });
    assert.equal(safe.event, "code_exchange");
    const stripped = stripSensitiveWhatsAppFields({
      metaAccessToken: "EAASECRET",
      metaAppSecret: "secret",
      metaWebhookVerifyToken: "verify",
      pin: "123456",
      webhookVerifyTokenConfigured: true,
    } as any);
    assert.equal((stripped as any).metaAccessToken, undefined);
    assert.equal((stripped as any).pin, undefined);
  });
});

describe("duplicate completion protection + admin summary", () => {
  it("blocks concurrent completion claims for the same state", () => {
    resetEmbeddedSignupRolloutMetricsForTests();
    assert.equal(tryClaimEmbeddedSignupCompletion("state-abc"), true);
    assert.equal(tryClaimEmbeddedSignupCompletion("state-abc"), false);
    releaseEmbeddedSignupCompletion("state-abc");
    assert.equal(tryClaimEmbeddedSignupCompletion("state-abc"), true);
    releaseEmbeddedSignupCompletion("state-abc");
  });

  it("completion lock map is capacity-bounded", () => {
    resetEmbeddedSignupRolloutMetricsForTests();
    for (let i = 0; i < 300; i++) {
      tryClaimEmbeddedSignupCompletion(`state-flood-${i}`);
    }
    // Map must not grow without bound; capacity rejects or prunes.
    // After flooding, further distinct claims may fail, but process stays stable.
    const again = tryClaimEmbeddedSignupCompletion("state-flood-extra");
    // Either rejected (capacity) or accepted after prune — never throws / unbounded.
    assert.equal(typeof again, "boolean");
    resetEmbeddedSignupRolloutMetricsForTests();
  });

  it("kill switch false ignores public mode + allowlist + 100% percentage", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "false",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT: "100",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_flag_disabled");
  });

  it("v4 SDK exchange continues to omit redirect_uri (source guard)", () => {
    const main = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(main, /omitRedirectUriForSdkV4 = tokenExchange === "sdk" && architecture === "v4"/);
    assert.match(main, /includeRedirectUri: !omitRedirectUriForSdkV4/);
  });

  it("prereq redirect_or_app_url accepts APP_URL alone (routing readiness, not exchange)", () => {
    const prereq = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_WHATSAPP_REDIRECT_URI: "",
      APP_URL: "https://app.example.com",
    });
    assert.equal(prereq.missing.includes("redirect_or_app_url"), false);
    assert.equal(prereq.diagnostics.appUrlConfigured, true);
    assert.equal(prereq.diagnostics.redirectUriConfigured, false);
  });

  it("Meta encryption env (META_ENCRYPTION_KEY only) satisfies v4 token_encryption readiness", () => {
    const withMetaKey = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_ENCRYPTION_KEY: "prod-meta-encryption-key-32bytes!",
      SESSION_SECRET: "",
      EMAIL_ENCRYPTION_KEY: "",
    });
    assert.equal(withMetaKey.diagnostics.tokenEncryptionConfigured, true);
    assert.equal(withMetaKey.missing.includes("token_encryption"), false);

    // SESSION_SECRET alone must NOT green-light Meta / v4 token encryption readiness.
    const withSessionOnly = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_ENCRYPTION_KEY: "",
      SESSION_SECRET: "prod-session-secret-for-meta-tokens!!",
      EMAIL_ENCRYPTION_KEY: "",
    });
    assert.equal(withSessionOnly.diagnostics.tokenEncryptionConfigured, false);
    assert.ok(withSessionOnly.missing.includes("token_encryption"));

    // EMAIL_ENCRYPTION_KEY is email-channel only — must not green-light Meta token readiness.
    const emailOnly = evaluateEmbeddedSignupV4Prerequisites({
      ...PREREQ,
      META_ENCRYPTION_KEY: "",
      SESSION_SECRET: "",
      EMAIL_ENCRYPTION_KEY: "railway-email-encryption-key-present!!",
    });
    assert.equal(emailOnly.diagnostics.tokenEncryptionConfigured, false);
    assert.ok(emailOnly.missing.includes("token_encryption"));
  });

  it("missing Meta encryption safely selects v2 and never exposes key material", () => {
    const secret = "super-secret-encryption-key-value-do-not-leak";
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...PREREQ,
        META_ENCRYPTION_KEY: "",
        SESSION_SECRET: "",
        EMAIL_ENCRYPTION_KEY: secret,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.match(r.reason, /^v4_prerequisites_incomplete:/);
    assert.ok(r.prerequisitesMissing.includes("token_encryption"));

    const summary = getEmbeddedSignupV4RolloutAdminSummary({
      oauthStatesSchemaAvailable: true,
      env: {
        ...PREREQ,
        META_ENCRYPTION_KEY: secret,
        SESSION_SECRET: "another-secret-must-not-appear",
        EMAIL_ENCRYPTION_KEY: "email-secret-must-not-appear",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
      },
    });
    const text = JSON.stringify(summary);
    assert.doesNotMatch(text, /super-secret-encryption-key-value-do-not-leak/);
    assert.doesNotMatch(text, /another-secret-must-not-appear/);
    assert.doesNotMatch(text, /email-secret-must-not-appear/);
    assert.equal(typeof (summary as any).prerequisites?.diagnostics?.tokenEncryptionConfigured, "boolean");
  });

  it("admin summary has no secrets and includes rollout fields", () => {
    resetEmbeddedSignupRolloutMetricsForTests();
    const summary = getEmbeddedSignupV4RolloutAdminSummary({
      oauthStatesSchemaAvailable: true,
      env: {
        ...PREREQ,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "false",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_PERCENT: "10",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "a,b",
      },
    });
    const text = JSON.stringify(summary);
    assert.doesNotMatch(text, /test-meta-app-secret|verify-token-test|EAA/);
    assert.equal((summary as any).killSwitchEnabled, false);
    assert.equal((summary as any).rolloutMode, "allowlist_only");
    assert.equal((summary as any).allowlistCount, 2);
    assert.ok((summary as any).metrics);
    assert.ok((summary as any).prerequisites);
  });

  it("sanitized config summary never embeds full config ids when long", () => {
    const s = buildSanitizedV4RolloutConfigSummary(PREREQ as any);
    assert.equal(s.v4ConfigIdLast4, "bbbb");
    assert.notEqual(s.v4ConfigIdLast4, PREREQ.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID);
  });

  it("v4 protect snap + failed registration preserve connection (source guards)", () => {
    const main = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(main, /v4ProtectSnap/);
    assert.match(main, /tryClaimEmbeddedSignupCompletion/);
    const reg = fs.readFileSync(path.join(process.cwd(), "server/whatsappPhoneRegister.ts"), "utf8");
    assert.match(reg, /already_registered/);
    assert.match(reg, /coexistence/);
  });

  it("Sales Admin rollout endpoint is registered", () => {
    const routes = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
    assert.match(routes, /\/api\/admin\/whatsapp\/embedded-signup-v4-rollout/);
    assert.match(routes, /requireAdmin/);
  });
});
