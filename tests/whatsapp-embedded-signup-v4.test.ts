/**
 * Phase 1: Embedded Signup architecture v2/v4 gating + isolation.
 * Run: npx tsx --test tests/whatsapp-embedded-signup-v4.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertValidEmbeddedSignupCombo,
  buildStandardEmbeddedSignupLoginOptions,
  configIdLast4,
  isTrustedMetaEmbeddedSignupOrigin,
  parseEmbeddedSignupSessionMessageData,
  parseWhatsappEmbeddedSignupArchitecture,
  resolveEmbeddedSignupConfigIdFromEnv,
  selectEmbeddedSignupArchitecture,
} from "../shared/whatsappEmbeddedSignupVersion";
import {
  createEmbeddedSignupCompletionCoordinator,
  shouldAutoRedirectAfterSdkFailure,
} from "../client/src/lib/whatsappEmbeddedSignupCompletion";
import {
  buildWhatsappEmbeddedSignupCodeExchangeUrl,
  classifyMetaCodeExchangeFailure,
  shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange,
} from "../server/metaOAuth";
import {
  shouldUseV4DirectAssetValidation,
  shouldUseDirectSessionAssetValidation,
  selectPhoneFromV4WabaListing,
  classifyV4DiscoveryGraphError,
  resolveV4EmbeddedSignupAssets,
} from "../server/whatsappEmbeddedSignupV4Assets";
import {
  isV4SdkDirectAssetValidationEnabled,
  isDirectSessionAssetValidationEnabled,
  sanitizeEmbeddedSignupClientError,
  probeAccessTokenExpiryFromDebug,
} from "../server/whatsappEmbeddedSignup";
import {
  isMetaPhoneCloudApiOperational,
  isMetaPhoneCloudApiRegistrationRequired,
} from "../shared/whatsappPhoneRegistration";

describe("architecture parsing", () => {
  it("accepts v2 and v4 only", () => {
    assert.equal(parseWhatsappEmbeddedSignupArchitecture("v2"), "v2");
    assert.equal(parseWhatsappEmbeddedSignupArchitecture("v4"), "v4");
    assert.equal(parseWhatsappEmbeddedSignupArchitecture("v3"), null);
    assert.equal(parseWhatsappEmbeddedSignupArchitecture(""), null);
  });

  it("rejects coexistence + v4 combination", () => {
    assert.throws(() => assertValidEmbeddedSignupCombo({ flow: "coexistence", architecture: "v4" }));
    assert.doesNotThrow(() => assertValidEmbeddedSignupCombo({ flow: "embedded", architecture: "v4" }));
    assert.doesNotThrow(() => assertValidEmbeddedSignupCombo({ flow: "coexistence", architecture: "v2" }));
  });
});

describe("server architecture selection", () => {
  const prereqEnv = {
    META_APP_ID: "810621184995059",
    META_APP_SECRET: "test-meta-app-secret",
    META_WHATSAPP_REDIRECT_URI: "https://app.example.com/api/integrations/whatsapp/meta/callback",
    META_WEBHOOK_VERIFY_TOKEN: "verify-token-test",
    META_ENCRYPTION_KEY: "test-meta-encryption-key-32bytes!!",
    META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
    APP_URL: "https://app.example.com",
  };

  it("defaults to v2 when flag is false", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "false",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "9999999999999999",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_flag_disabled");
  });

  it("defaults to v2 when v4 config id is missing", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "true",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_config_id_missing");
  });

  it("selects v4 only when flag + config + allowlist_only + explicit allowlisted user ID", () => {
    const allowlisted = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1,user-2",
      },
    });
    assert.equal(allowlisted.architecture, "v4");
    assert.equal(allowlisted.reason, "v4_allowlisted_user");

    const ordinaryNotAllowlisted = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-9",
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(ordinaryNotAllowlisted.architecture, "v2");
    assert.equal(ordinaryNotAllowlisted.reason, "v4_env_ready_but_user_not_allowlisted");

    const adminNotAllowlisted = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "admin-user",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(adminNotAllowlisted.architecture, "v2");
    assert.equal(adminNotAllowlisted.reason, "v4_env_ready_but_user_not_allowlisted");
  });

  it("keeps v2 when allowlist is empty or malformed (whitespace-only entries ignored)", () => {
    const empty = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "",
      },
    });
    assert.equal(empty.architecture, "v2");
    assert.equal(empty.reason, "v4_allowlist_empty");

    const whitespaceOnly = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "allowlist_only",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: " ,  , ",
      },
    });
    assert.equal(whitespaceOnly.architecture, "v2");
    assert.equal(whitespaceOnly.reason, "v4_allowlist_empty");
  });

  it("never selects standard v4 for coexistence flow", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "coexistence",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        ...prereqEnv,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
  });
});

describe("config id isolation", () => {
  const env = {
    META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
    META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
    META_WHATSAPP_COEXISTENCE_CONFIG_ID: "coex-config-cccccccc",
  };

  it("never silently swaps v2 / v4 / coexistence config ids", () => {
    assert.equal(resolveEmbeddedSignupConfigIdFromEnv("embedded", "v2", env).configId, "v2-config-aaaaaaaa");
    assert.equal(resolveEmbeddedSignupConfigIdFromEnv("embedded", "v4", env).configId, "v4-config-bbbbbbbb");
    assert.equal(resolveEmbeddedSignupConfigIdFromEnv("coexistence", "v2", env).configId, "coex-config-cccccccc");
    assert.throws(() => resolveEmbeddedSignupConfigIdFromEnv("coexistence", "v4", env));
  });

  it("configIdLast4 never returns full id for long values", () => {
    assert.equal(configIdLast4("v2-config-aaaaaaaa"), "aaaa");
    assert.equal(configIdLast4(null), null);
  });
});

describe("FB.login option builders", () => {
  it("builds production v2 extras with sessionInfoVersion 2", () => {
    const opts = buildStandardEmbeddedSignupLoginOptions({
      architecture: "v2",
      configId: "v2-config",
    });
    assert.equal(opts.config_id, "v2-config");
    assert.equal(opts.response_type, "code");
    assert.equal(opts.override_default_response_type, true);
    assert.equal((opts.extras as any).sessionInfoVersion, "2");
    assert.equal((opts.extras as any).feature, "whatsapp_embedded_signup");
    assert.equal((opts.extras as any).featureType, undefined);
  });

  it("builds v4 with empty extras and no coexistence featureType", () => {
    const opts = buildStandardEmbeddedSignupLoginOptions({
      architecture: "v4",
      configId: "v4-config",
    });
    assert.equal(opts.config_id, "v4-config");
    assert.equal(opts.response_type, "code");
    assert.equal(opts.override_default_response_type, true);
    assert.deepEqual(opts.extras, {});
    assert.equal((opts.extras as any).featureType, undefined);
    assert.equal((opts.extras as any).sessionInfoVersion, undefined);
  });
});

describe("session message origin + payload validation", () => {
  it("accepts exact trusted Meta origins only", () => {
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://www.facebook.com"), true);
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://web.facebook.com"), true);
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://evilfacebook.com"), false);
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://www.facebook.com.evil.com"), false);
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("http://www.facebook.com"), false);
    assert.equal(isTrustedMetaEmbeddedSignupOrigin("https://facebook.com"), true);
  });

  it("parses FINISH and ignores non-session payloads", () => {
    const ok = parseEmbeddedSignupSessionMessageData({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      data: { waba_id: "123", phone_number_id: "456" },
    });
    assert.equal(ok?.event, "FINISH");
    assert.equal(ok?.wabaId, "123");
    assert.equal(ok?.phoneNumberId, "456");

    assert.equal(parseEmbeddedSignupSessionMessageData({ type: "OTHER" }), null);
    assert.equal(parseEmbeddedSignupSessionMessageData("not-json"), null);
    assert.equal(
      parseEmbeddedSignupSessionMessageData({
        type: "WA_EMBEDDED_SIGNUP",
        event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
        data: { waba_id: "9" },
      })?.event,
      "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    );
  });

  it("parses FINISH_ONLY_WABA and numeric Meta IDs without inventing a phone", () => {
    const wabaOnly = parseEmbeddedSignupSessionMessageData({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      data: { waba_id: 9988776655 },
    });
    assert.equal(wabaOnly?.event, "FINISH_ONLY_WABA");
    assert.equal(wabaOnly?.wabaId, "9988776655");
    assert.equal(wabaOnly?.phoneNumberId, undefined);
  });
});

describe("completion coordinator ordering + single complete-sdk", () => {
  it("calls complete-sdk once when code arrives before finish event", async () => {
    let calls = 0;
    const coordinator = createEmbeddedSignupCompletionCoordinator({
      state: "state-1",
      architecture: "v4",
      counterpartWaitMs: 30,
      completeSdk: async (payload) => {
        calls += 1;
        assert.equal(payload.code, "code-a");
        assert.equal(payload.sessionEvent?.event, "FINISH");
        assert.equal(payload.sessionEvent?.wabaId, "w1");
        assert.equal(payload.sessionEvent?.phoneNumberId, "p1");
        return { ok: true };
      },
    });

    coordinator.acceptAuthCode("code-a");
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(calls, 0);
    coordinator.acceptSessionEvent({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      rawEvent: "FINISH",
      wabaId: "w1",
      phoneNumberId: "p1",
    });
    const result = await coordinator.done;
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
    // Second accept must not re-fire
    coordinator.acceptAuthCode("code-b");
    coordinator.acceptSessionEvent({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      rawEvent: "FINISH",
      wabaId: "w2",
    });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls, 1);
  });

  it("calls complete-sdk once when finish event arrives before code", async () => {
    let calls = 0;
    const coordinator = createEmbeddedSignupCompletionCoordinator({
      state: "state-2",
      architecture: "v4",
      counterpartWaitMs: 30,
      completeSdk: async (payload) => {
        calls += 1;
        assert.equal(payload.code, "code-z");
        assert.equal(payload.sessionEvent?.event, "FINISH_ONLY_WABA");
        assert.equal(payload.sessionEvent?.phoneNumberId, undefined);
        return {
          ok: false,
          error: "phone incomplete",
          errorCode: "phone_setup_incomplete",
          wabaId: "waba-only",
          httpStatus: 400,
        };
      },
    });

    coordinator.acceptSessionEvent({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_ONLY_WABA",
      rawEvent: "FINISH_ONLY_WABA",
      wabaId: "waba-only",
    });
    assert.equal(calls, 0);
    coordinator.acceptAuthCode("code-z");
    const result = await coordinator.done;
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.errorCode, "phone_setup_incomplete");
    assert.equal(calls, 1);
  });

  it("completes with code alone after brief wait when session event is missing", async () => {
    let calls = 0;
    const coordinator = createEmbeddedSignupCompletionCoordinator({
      state: "state-3",
      architecture: "v2",
      counterpartWaitMs: 20,
      completeSdk: async (payload) => {
        calls += 1;
        assert.equal(payload.code, "code-solo");
        assert.equal(payload.sessionEvent, undefined);
        return { ok: true };
      },
    });
    coordinator.acceptAuthCode("code-solo");
    const result = await coordinator.done;
    assert.equal(result.ok, true);
    assert.equal(calls, 1);
  });
});

describe("redirect fallback policy after SDK signup", () => {
  it("never redirects after FB.login, finish, or complete-sdk attempt", () => {
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
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v2",
        fbLoginInvoked: false,
        finishEventSeen: false,
        completeSdkAttempted: true,
      }),
      false,
    );
  });

  it("allows redirect for early pre-login failures (v2 and v4; server selects architecture)", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v2",
        fbLoginInvoked: false,
        finishEventSeen: false,
        completeSdkAttempted: false,
      }),
      true,
    );
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
});

describe("oauth state TTL + public v2 / coexistence invariants", () => {
  it("keeps oauth state TTL long enough for Meta dialog completion", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(src, /WHATSAPP_OAUTH_STATE_TTL_MS\s*=\s*60\s*\*\s*60\s*\*\s*1000/);
    assert.doesNotMatch(src, /const STATE_TTL_MS = 15 \* 60 \* 1000/);
  });

  it("records architecture on session_start and expired complete-sdk diagnostics", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(src, /phase:\s*"session_start"/);
    assert.match(src, /complete_sdk_state_missing_or_expired/);
    assert.match(src, /phone_setup_incomplete/);
    assert.match(src, /codeCallbackReceived:\s*true/);
  });

  it("failed v4 completion preserves prior connection (protect snap)", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(src, /v4ProtectSnap/);
    assert.match(src, /restorePersistedMetaSnapshot/);
  });

  it("public v2 login options remain unchanged (sessionInfoVersion 2, no coexistence featureType)", () => {
    const opts = buildStandardEmbeddedSignupLoginOptions({
      architecture: "v2",
      configId: "prod-v2",
    });
    assert.equal((opts.extras as any).sessionInfoVersion, "2");
    assert.equal((opts.extras as any).feature, "whatsapp_embedded_signup");
    assert.equal((opts.extras as any).featureType, undefined);
  });

  it("coexistence stays Coming soon for public users; gated launch uses server flag", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const hub = await fs.readFile(
      path.join(process.cwd(), "client/src/components/ConnectWhatsAppHub.tsx"),
      "utf8",
    );
    assert.match(hub, /Coming soon/);
    assert.match(hub, /coexistenceLaunchAllowed/);
    assert.match(hub, /startEmbeddedSignupViaSdk\("coexistence"\)/);
    assert.doesNotMatch(hub, /featureType:\s*["']whatsapp_business_app_onboarding["']/);
    assert.match(hub, /shouldAutoRedirectAfterSdkFailure/);
  });
});

describe("v4 authorization-code exchange contract", () => {
  it("omits redirect_uri for v4 SDK exchange URL (Login for Business SUAT shape)", () => {
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v4",
        flow: "embedded",
      }),
      true,
    );
    const built = buildWhatsappEmbeddedSignupCodeExchangeUrl({
      graphBase: "https://graph.facebook.com/v21.0",
      clientId: "810621184995059",
      clientSecret: "test-secret",
      code: "test-code",
      includeRedirectUri: false,
    });
    assert.equal(built.redirectUriSent, false);
    assert.match(built.url, /client_id=810621184995059/);
    assert.match(built.url, /code=test-code/);
    assert.doesNotMatch(built.url, /redirect_uri=/);
  });

  it("includes exact redirect_uri for v2 / redirect exchange (unchanged contract)", () => {
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v2",
        flow: "embedded",
      }),
      false,
    );
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "redirect",
        architecture: "v2",
        flow: "embedded",
      }),
      false,
    );
    const built = buildWhatsappEmbeddedSignupCodeExchangeUrl({
      graphBase: "https://graph.facebook.com/v21.0",
      clientId: "810621184995059",
      clientSecret: "test-secret",
      code: "test-code",
      includeRedirectUri: true,
      redirectUri: "https://app.whachatcrm.com/api/integrations/whatsapp/meta/callback",
    });
    assert.equal(built.redirectUriSent, true);
    assert.match(
      built.url,
      /redirect_uri=https%3A%2F%2Fapp\.whachatcrm\.com%2Fapi%2Fintegrations%2Fwhatsapp%2Fmeta%2Fcallback/,
    );
  });

  it("classifies Meta 36008 as redirect_uri_mismatch and secret errors as app_credentials_mismatch", () => {
    assert.equal(
      classifyMetaCodeExchangeFailure({
        httpStatus: 400,
        meta: {
          code: 100,
          type: "OAuthException",
          subcode: 36008,
          message:
            "Error validating verification code. Please make sure your redirect_uri is identical to the one you used in the OAuth dialog request",
        },
      }),
      "redirect_uri_mismatch",
    );
    assert.equal(
      classifyMetaCodeExchangeFailure({
        httpStatus: 400,
        meta: { code: 101, message: "Invalid client_id" },
      }),
      "app_credentials_mismatch",
    );
    assert.equal(
      classifyMetaCodeExchangeFailure({
        httpStatus: 400,
        meta: { message: "Error validating client secret." },
      }),
      "app_credentials_mismatch",
    );
    assert.equal(
      classifyMetaCodeExchangeFailure({
        httpStatus: 400,
        meta: { message: "This authorization code has expired." },
      }),
      "invalid_code",
    );
  });

  it("v4 path skips incompatible long-lived user-token exchange; v2 keeps it", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(src, /shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange/);
    assert.match(src, /v4_business_integration_token_no_user_fb_exchange/);
    assert.match(src, /exchangeForLongLivedUserToken/);
    // Ensure v4 branch skips fb_exchange before the v2 else path.
    const v4Idx = src.indexOf('architecture === "v4"');
    const skipIdx = src.indexOf("v4_business_integration_token_no_user_fb_exchange");
    const longLivedIdx = src.indexOf("exchangeForLongLivedUserToken(shortToken)");
    assert.ok(v4Idx > 0 && skipIdx > v4Idx && longLivedIdx > skipIdx);
  });

  it("failed exchange stores no token / no partial connection markers in source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    // On code_exchange failure we return before connectUserMeta / discovery.
    const failReturn = src.indexOf('errorCode: "code_exchange_failed"');
    const connectCall = src.indexOf("connectUserMeta(row.userId");
    assert.ok(failReturn > 0 && connectCall > failReturn);
  });

  it("complete-sdk remains exactly-once on the client coordinator", async () => {
    let calls = 0;
    const coordinator = createEmbeddedSignupCompletionCoordinator({
      state: "state-ex",
      architecture: "v4",
      counterpartWaitMs: 5,
      completeSdk: async () => {
        calls += 1;
        return {
          ok: false,
          error: "exchange failed",
          errorCode: "code_exchange_failed",
          httpStatus: 400,
        };
      },
    });
    coordinator.acceptSessionEvent({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH",
      rawEvent: "FINISH",
      wabaId: "961217696997428",
      phoneNumberId: "1191517910720500",
    });
    coordinator.acceptAuthCode("code-once");
    await coordinator.done;
    coordinator.acceptAuthCode("code-twice");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls, 1);
  });
});

describe("v4 direct WABA/phone validation (no /me/businesses)", () => {
  it("uses direct validation only for v4 SDK, not v2 or redirect", () => {
    assert.equal(
      shouldUseV4DirectAssetValidation({ architecture: "v4", tokenExchange: "sdk" }),
      true,
    );
    assert.equal(
      shouldUseV4DirectAssetValidation({ architecture: "v2", tokenExchange: "sdk" }),
      false,
    );
    assert.equal(
      shouldUseV4DirectAssetValidation({ architecture: "v4", tokenExchange: "redirect" }),
      false,
    );
  });

  it("flow-aware direct validation includes coexistence SDK without converting architecture to v4", () => {
    assert.equal(
      shouldUseDirectSessionAssetValidation({
        architecture: "v2",
        tokenExchange: "sdk",
        flow: "coexistence",
      }),
      true,
    );
    assert.equal(
      shouldUseDirectSessionAssetValidation({
        architecture: "v2",
        tokenExchange: "sdk",
        flow: "embedded",
      }),
      false,
    );
    assert.equal(isDirectSessionAssetValidationEnabled("v2", "sdk", "coexistence"), true);
    assert.equal(isDirectSessionAssetValidationEnabled("v2", "sdk", "embedded"), false);
  });

  it("completion module binds shouldUseV4DirectAssetValidation at runtime (not a free identifier)", () => {
    // Calling this exported wrapper fails with ReferenceError if the import was omitted
    // from whatsappEmbeddedSignup.ts while the completion path still references the symbol.
    assert.equal(isV4SdkDirectAssetValidationEnabled("v4", "sdk"), true);
    assert.equal(isV4SdkDirectAssetValidationEnabled("v2", "sdk"), false);
    assert.equal(isV4SdkDirectAssetValidationEnabled("v4", "redirect"), false);
    assert.equal(
      isV4SdkDirectAssetValidationEnabled("v4", "sdk"),
      shouldUseV4DirectAssetValidation({ architecture: "v4", tokenExchange: "sdk" }),
    );
  });

  it("sanitizes ReferenceError / undeclared-identifier messages for clients", () => {
    assert.equal(
      sanitizeEmbeddedSignupClientError(
        new ReferenceError("shouldUseV4DirectAssetValidation is not defined"),
      ),
      "Could not finish WhatsApp setup. Please try Connect WhatsApp again.",
    );
    assert.match(
      sanitizeEmbeddedSignupClientError("Phone not under WABA"),
      /Phone not under WABA/,
    );
  });

  it("Never-expire debug_token (expires_at: 0) normalizes expiry to null", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { expires_at: 0, is_valid: true, type: "SYSTEM_USER" } }), {
        status: 200,
      })) as typeof fetch;
    try {
      process.env.META_APP_ID = process.env.META_APP_ID || "123";
      process.env.META_APP_SECRET = process.env.META_APP_SECRET || "secret";
      const probed = await probeAccessTokenExpiryFromDebug("tok");
      assert.equal(probed.ok, true);
      assert.equal(probed.neverExpires, true);
      assert.equal(probed.expiresAt, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("already CONNECTED CLOUD_API phone skips registration on reconnect", () => {
    const fields = {
      status: "CONNECTED",
      codeVerificationStatus: "VERIFIED",
      platformType: "CLOUD_API",
    };
    assert.equal(isMetaPhoneCloudApiOperational(fields), true);
    assert.equal(isMetaPhoneCloudApiRegistrationRequired(fields, { coexistence: false }), false);
  });

  it("selects phone from WABA listing: one / zero / multiple", () => {
    assert.deepEqual(selectPhoneFromV4WabaListing([{ id: "1191517910720500" }]), {
      mode: "single",
      phoneId: "1191517910720500",
    });
    assert.deepEqual(selectPhoneFromV4WabaListing([]), { mode: "none" });
    assert.deepEqual(
      selectPhoneFromV4WabaListing([{ id: "1" }, { id: "2" }]),
      { mode: "ambiguous" },
    );
  });

  it("classifies Missing Permission on businesses/waba as discovery categories", () => {
    assert.equal(
      classifyV4DiscoveryGraphError({
        httpStatus: 400,
        meta: { code: 100, message: "(#100) Missing Permission" },
        context: "businesses",
      }),
      "waba_discovery_missing_permission",
    );
    assert.equal(
      classifyV4DiscoveryGraphError({
        httpStatus: 400,
        meta: { code: 100, message: "(#100) Missing Permission" },
        context: "waba",
      }),
      "waba_discovery_missing_permission",
    );
  });

  it("missing session assets returns session_assets_missing without calling Graph businesses", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ data: { scopes: [], type: "USER", is_valid: true } }), {
        status: 200,
      });
    }) as typeof fetch;
    try {
      const r = await resolveV4EmbeddedSignupAssets({
        accessToken: "tok",
        sessionWabaId: null,
        sessionPhoneNumberId: null,
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.errorCode, "session_assets_missing");
      assert.equal(
        calls.every((u) => !u.includes("/me/businesses")),
        true,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("validates WABA+phone directly via WABA node and phone_numbers listing", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("debug_token")) {
        return new Response(
          JSON.stringify({
            data: {
              app_id: "810621184995059",
              type: "USER",
              is_valid: true,
              scopes: ["whatsapp_business_management", "whatsapp_business_messaging"],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/961217696997428?") && url.includes("fields=id")) {
        return new Response(JSON.stringify({ id: "961217696997428", name: "Whachat CRM" }), {
          status: 200,
        });
      }
      if (url.includes("/961217696997428/phone_numbers")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "1191517910720500",
                display_phone_number: "+1 954-513-9408",
                verified_name: "Whachat CRM",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/1191517910720500?")) {
        return new Response(
          JSON.stringify({
            id: "1191517910720500",
            whatsapp_business_account: { id: "961217696997428" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: "unexpected" } }), { status: 400 });
    }) as typeof fetch;
    try {
      const r = await resolveV4EmbeddedSignupAssets({
        accessToken: "tok",
        sessionWabaId: "961217696997428",
        sessionPhoneNumberId: "1191517910720500",
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.resolved.wabaId, "961217696997428");
        assert.equal(r.resolved.phoneNumberId, "1191517910720500");
      }
      assert.equal(calls.some((u) => u.includes("/me/businesses")), false);
      assert.equal(calls.some((u) => u.includes("/961217696997428?")), true);
      assert.equal(calls.some((u) => u.includes("/phone_numbers")), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("rejects phone/WABA mismatch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.includes("debug_token")) {
        return new Response(JSON.stringify({ data: { scopes: [], type: "USER", is_valid: true } }), {
          status: 200,
        });
      }
      if (url.includes("/961217696997428?") && !url.includes("phone_numbers")) {
        return new Response(JSON.stringify({ id: "961217696997428" }), { status: 200 });
      }
      if (url.includes("/phone_numbers")) {
        return new Response(JSON.stringify({ data: [{ id: "999" }] }), { status: 200 });
      }
      if (url.includes("/1191517910720500?")) {
        return new Response(
          JSON.stringify({ whatsapp_business_account: { id: "111111111111111" } }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await resolveV4EmbeddedSignupAssets({
        accessToken: "tok",
        sessionWabaId: "961217696997428",
        sessionPhoneNumberId: "1191517910720500",
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.errorCode, "phone_not_under_waba");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WABA-only with zero / one / multiple phones", async () => {
    const originalFetch = globalThis.fetch;
    async function run(phones: Array<{ id: string }>) {
      globalThis.fetch = (async (input: any) => {
        const url = String(input);
        if (url.includes("debug_token")) {
          return new Response(JSON.stringify({ data: { scopes: [], type: "USER", is_valid: true } }), {
            status: 200,
          });
        }
        if (url.includes("/961217696997428?") && !url.includes("phone_numbers")) {
          return new Response(JSON.stringify({ id: "961217696997428" }), { status: 200 });
        }
        if (url.includes("/phone_numbers")) {
          return new Response(JSON.stringify({ data: phones }), { status: 200 });
        }
        if (url.includes("whatsapp_business_account")) {
          return new Response(
            JSON.stringify({ whatsapp_business_account: { id: "961217696997428" } }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }) as typeof fetch;
      return resolveV4EmbeddedSignupAssets({
        accessToken: "tok",
        sessionWabaId: "961217696997428",
        sessionPhoneNumberId: null,
      });
    }
    try {
      const zero = await run([]);
      assert.equal(zero.ok, false);
      if (!zero.ok) assert.equal(zero.errorCode, "phone_setup_incomplete");

      const one = await run([{ id: "1191517910720500" }]);
      assert.equal(one.ok, true);
      if (one.ok) assert.equal(one.resolved.phoneNumberId, "1191517910720500");

      const many = await run([{ id: "1" }, { id: "2" }]);
      assert.equal(many.ok, false);
      if (!many.ok) assert.equal(many.errorCode, "phone_ambiguous");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("direct WABA access denied maps to waba_access_denied", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      if (url.includes("debug_token")) {
        return new Response(JSON.stringify({ data: { scopes: [], type: "USER", is_valid: true } }), {
          status: 200,
        });
      }
      if (url.includes("/961217696997428?")) {
        return new Response(
          JSON.stringify({ error: { code: 100, message: "(#100) Missing Permission", type: "OAuthException" } }),
          { status: 400 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as typeof fetch;
    try {
      const r = await resolveV4EmbeddedSignupAssets({
        accessToken: "tok",
        sessionWabaId: "961217696997428",
        sessionPhoneNumberId: "1191517910720500",
      });
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.errorCode, "waba_access_denied");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("v4 completion never falls back to /me/businesses; v2 discovery still uses it", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const main = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    const v4mod = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignupV4Assets.ts"),
      "utf8",
    );
    assert.match(main, /from ["']\.\/whatsappEmbeddedSignupV4Assets["']/);
    assert.match(main, /shouldUseDirectSessionAssetValidation/);
    assert.match(main, /shouldUseV4DirectAssetValidation/);
    assert.match(main, /resolveV4EmbeddedSignupAssets/);
    assert.match(main, /isV4SdkDirectAssetValidationEnabled/);
    assert.match(main, /isDirectSessionAssetValidationEnabled/);
    assert.match(main, /fetchUserWabaChoices/);
    assert.match(main, /\/me\/businesses/);
    assert.doesNotMatch(v4mod, /\$\{base\}\/me\/businesses/);
    assert.doesNotMatch(v4mod, /fetch\([\s\S]*me\/businesses/);
    assert.match(main, /usedMeBusinessesEnumeration:\s*false/);
    assert.match(main, /discoveryFailureCategory/);
    assert.match(main, /v4ProtectSnap/);
    assert.match(main, /subscribeAppToWaba/);
    assert.match(main, /coexistence_direct_session_assets/);
  });

  it("successful oauth debug clears stale code_exchange_failed", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"),
      "utf8",
    );
    assert.match(src, /if \(patch\.ok === true\)/);
    assert.match(src, /delete next\.errorCode/);
  });

  it("coexistence remains Coming soon for non-gated public UI", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const hub = await fs.readFile(
      path.join(process.cwd(), "client/src/components/ConnectWhatsAppHub.tsx"),
      "utf8",
    );
    assert.match(hub, /Coming soon/);
    assert.match(hub, /coexistenceLaunchAllowed/);
  });
});
