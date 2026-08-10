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
  it("defaults to v2 when flag is false", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      sessionIsAdmin: true,
      env: {
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "false",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "9999999999999999",
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
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "true",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "v4_config_id_missing");
  });

  it("selects v4 only when flag + config + explicit allowlisted user ID", () => {
    const allowlisted = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-1",
      env: {
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ALLOWLIST_USER_IDS: "user-1,user-2",
      },
    });
    assert.equal(allowlisted.architecture, "v4");
    assert.equal(allowlisted.reason, "v4_allowlisted_user");

    const ordinaryNotAllowlisted = selectEmbeddedSignupArchitecture({
      flow: "embedded",
      userId: "user-9",
      env: {
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
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
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
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
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
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
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
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
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "1",
        META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "1111222233334444",
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
  it("never redirects for v4, after FB.login, finish, or complete-sdk attempt", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v4",
        fbLoginInvoked: false,
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

  it("allows redirect only for early public v2 pre-login failures", () => {
    assert.equal(
      shouldAutoRedirectAfterSdkFailure({
        architecture: "v2",
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

  it("coexistence remains disabled in ConnectWhatsAppHub source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const hub = await fs.readFile(
      path.join(process.cwd(), "client/src/components/ConnectWhatsAppHub.tsx"),
      "utf8",
    );
    assert.match(hub, /disabled=\{true\}/);
    assert.match(hub, /Coming soon/);
    assert.doesNotMatch(hub, /featureType:\s*["']whatsapp_business_app_onboarding["']/);
    assert.match(hub, /shouldAutoRedirectAfterSdkFailure/);
  });
});
