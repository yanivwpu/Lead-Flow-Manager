/**
 * Phase 2: WhatsApp Business App Coexistence — controlled test readiness.
 * Run: npx tsx --test tests/whatsapp-coexistence-phase2.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  evaluateCoexistenceOnboardingGate,
  evaluateCoexistenceConfigIsolation,
  isCoexistenceOnboardingAllowedForUser,
  COEXISTENCE_COMING_SOON_MESSAGE,
} from "../shared/whatsappCoexistenceGate";
import { resolvePersistedMetaConnectionType } from "../shared/whatsappConnectionType";
import { parseMetaWhatsappAccountUpdate } from "../shared/whatsappCoexistenceAccountUpdate";
import {
  buildCoexistenceEmbeddedSignupLoginOptions,
  buildStandardEmbeddedSignupLoginOptions,
  resolveEmbeddedSignupConfigIdFromEnv,
  selectEmbeddedSignupArchitecture,
  evaluateEmbeddedSignupV4Prerequisites,
  parseEmbeddedSignupSessionMessageData,
} from "../shared/whatsappEmbeddedSignupVersion";
import { isMetaPhoneCloudApiRegistrationRequired } from "../shared/whatsappPhoneRegistration";
import { evaluateMetaWhatsAppReadiness } from "../shared/whatsappReadiness";
import {
  buildWhatsappEmbeddedSignupCodeExchangeUrl,
  shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange,
} from "../server/metaOAuth";
import {
  shouldUseDirectSessionAssetValidation,
  shouldUseV4DirectAssetValidation,
  selectPhoneFromV4WabaListing,
  resolveV4EmbeddedSignupAssets,
} from "../server/whatsappEmbeddedSignupV4Assets";
import {
  isDirectSessionAssetValidationEnabled,
  isV4SdkDirectAssetValidationEnabled,
} from "../server/whatsappEmbeddedSignup";

const BASE = {
  META_APP_ID: "810621184995059",
  META_APP_SECRET: "test-meta-app-secret",
  META_WHATSAPP_REDIRECT_URI: "https://app.example.com/api/integrations/whatsapp/meta/callback",
  META_WEBHOOK_VERIFY_TOKEN: "verify-token-test",
  META_ENCRYPTION_KEY: "test-meta-encryption-key-32bytes!!",
  META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID: "v2-config-aaaaaaaa",
  META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID: "v4-config-bbbbbbbb",
  META_WHATSAPP_COEXISTENCE_CONFIG_ID: "coex-config-cccccccc",
  WHATSAPP_EMBEDDED_SIGNUP_ENABLED: "true",
  APP_URL: "https://app.example.com",
};

describe("Coexistence test gate", () => {
  it("normal public user cannot launch when test flag off", () => {
    const d = evaluateCoexistenceOnboardingGate({
      userId: "user-public",
      env: { ...BASE, WHATSAPP_COEXISTENCE_TEST_ENABLED: "false" },
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "test_flag_disabled");
  });

  it("allowlisted user can launch when test flag on", () => {
    const d = evaluateCoexistenceOnboardingGate({
      userId: "tester-1",
      env: {
        ...BASE,
        WHATSAPP_COEXISTENCE_TEST_ENABLED: "true",
        WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS: "tester-1,tester-2",
      },
    });
    assert.equal(d.allowed, true);
    assert.equal(
      isCoexistenceOnboardingAllowedForUser("outsider", {
        ...BASE,
        WHATSAPP_COEXISTENCE_TEST_ENABLED: "true",
        WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS: "tester-1",
      }),
      false,
    );
  });

  it("missing coexistence config fails closed", () => {
    const d = evaluateCoexistenceOnboardingGate({
      userId: "tester-1",
      env: {
        ...BASE,
        META_WHATSAPP_COEXISTENCE_CONFIG_ID: "",
        WHATSAPP_COEXISTENCE_TEST_ENABLED: "true",
        WHATSAPP_COEXISTENCE_ALLOWLIST_USER_IDS: "tester-1",
      },
    });
    assert.equal(d.allowed, false);
    assert.equal(d.reason, "missing_coexistence_config");
  });

  it("start route still returns coming-soon for unauthorized callers", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /evaluateCoexistenceOnboardingGate/);
    assert.match(src, /COEXISTENCE_COMING_SOON_MESSAGE/);
    assert.equal(COEXISTENCE_COMING_SOON_MESSAGE.includes("coming soon"), true);
  });
});

describe("Coexistence config isolation", () => {
  it("uses dedicated coexistence config only", () => {
    const cfg = resolveEmbeddedSignupConfigIdFromEnv("coexistence", "v2", BASE as any);
    assert.equal(cfg.configId, BASE.META_WHATSAPP_COEXISTENCE_CONFIG_ID);
    assert.notEqual(cfg.configId, BASE.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);
    assert.notEqual(cfg.configId, BASE.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID);
  });

  it("v2 == coexistence fails prerequisites", () => {
    const prereq = evaluateEmbeddedSignupV4Prerequisites({
      ...BASE,
      META_WHATSAPP_COEXISTENCE_CONFIG_ID: BASE.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
    } as any);
    assert.equal(prereq.ok, false);
    assert.ok(prereq.missing.includes("config_isolation"));
  });

  it("coexistence isolation helper detects collision", () => {
    const bad = evaluateCoexistenceConfigIsolation({
      ...BASE,
      META_WHATSAPP_COEXISTENCE_CONFIG_ID: BASE.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID,
    } as any);
    assert.equal(bad.ok, false);
    assert.equal(bad.collisionWithStandard, true);
  });

  it("coexistence architecture selection stays on dedicated path (label v2)", () => {
    const r = selectEmbeddedSignupArchitecture({
      flow: "coexistence",
      userId: "tester-1",
      env: {
        ...BASE,
        WHATSAPP_EMBEDDED_SIGNUP_V4_ENABLED: "true",
        WHATSAPP_EMBEDDED_SIGNUP_V4_ROLLOUT_MODE: "public",
      },
    });
    assert.equal(r.architecture, "v2");
    assert.equal(r.reason, "coexistence_uses_dedicated_config_not_standard_v4");
  });
});

describe("Coexistence login options vs Standard", () => {
  it("coexistence login includes setup + featureType; standard never does", () => {
    const coex = buildCoexistenceEmbeddedSignupLoginOptions({
      configId: BASE.META_WHATSAPP_COEXISTENCE_CONFIG_ID,
    });
    assert.deepEqual(coex.extras.setup, {});
    assert.equal((coex.extras as any).featureType, "whatsapp_business_app_onboarding");
    assert.equal((coex.extras as any).sessionInfoVersion, "3");
    assert.match(coex.scope, /whatsapp_business_management/);
    assert.match(coex.scope, /whatsapp_business_messaging/);
    assert.equal(
      coex.scope
        .split(",")
        .map((s) => s.trim())
        .includes("business_management"),
      false,
    );
    const std = buildStandardEmbeddedSignupLoginOptions({
      architecture: "v2",
      configId: BASE.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
    });
    assert.equal((std.extras as any).featureType, undefined);
    const v4 = buildStandardEmbeddedSignupLoginOptions({
      architecture: "v4",
      configId: BASE.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID,
    });
    assert.equal((v4.extras as any).featureType, undefined);
    assert.deepEqual(v4.extras, {});
  });
});

describe("Coexistence direct session-asset discovery", () => {
  it("uses direct session assets for coexistence SDK even when architecture label is v2", () => {
    assert.equal(
      shouldUseDirectSessionAssetValidation({
        architecture: "v2",
        tokenExchange: "sdk",
        flow: "coexistence",
      }),
      true,
    );
    assert.equal(
      shouldUseV4DirectAssetValidation({ architecture: "v2", tokenExchange: "sdk" }),
      false,
    );
    assert.equal(isDirectSessionAssetValidationEnabled("v2", "sdk", "coexistence"), true);
    assert.equal(isV4SdkDirectAssetValidationEnabled("v2", "sdk"), false);
  });

  it("does not broaden direct path to legacy Standard v2 embedded SDK", () => {
    assert.equal(
      shouldUseDirectSessionAssetValidation({
        architecture: "v2",
        tokenExchange: "sdk",
        flow: "embedded",
      }),
      false,
    );
    assert.equal(
      shouldUseDirectSessionAssetValidation({
        architecture: "v4",
        tokenExchange: "sdk",
        flow: "embedded",
      }),
      true,
    );
  });

  it("parses FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING waba_id from Meta coexistence payload", () => {
    const parsed = parseEmbeddedSignupSessionMessageData({
      type: "WA_EMBEDDED_SIGNUP",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
      version: 3,
      data: { waba_id: "961217696997428" },
    });
    assert.ok(parsed);
    assert.equal(parsed!.event, "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
    assert.equal(parsed!.wabaId, "961217696997428");
    assert.equal(parsed!.phoneNumberId, undefined);
  });

  it("WABA-only listing: single phone ok; zero/ambiguous fail closed", () => {
    assert.equal(selectPhoneFromV4WabaListing([{ id: "111" }]).mode, "single");
    assert.equal(selectPhoneFromV4WabaListing([]).mode, "none");
    assert.equal(selectPhoneFromV4WabaListing([{ id: "1" }, { id: "2" }]).mode, "ambiguous");
  });

  it("resolveV4EmbeddedSignupAssets never calls /me/businesses (coexistence reuses this path)", async () => {
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/debug_token")) {
        return new Response(JSON.stringify({ data: { is_valid: true, scopes: ["whatsapp_business_management"], type: "USER" } }), {
          status: 200,
        });
      }
      if (url.includes("/961217696997428?") && url.includes("fields=id")) {
        return new Response(JSON.stringify({ id: "961217696997428", name: "Coex WABA" }), { status: 200 });
      }
      if (url.includes("/961217696997428/phone_numbers")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "1191517910720500",
                display_phone_number: "+1 555 0100",
                verified_name: "Test Biz",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("whatsapp_business_account")) {
        return new Response(
          JSON.stringify({
            id: "1191517910720500",
            whatsapp_business_account: { id: "961217696997428" },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { message: "unexpected", code: 1 } }), { status: 400 });
    }) as typeof fetch;
    try {
      const r = await resolveV4EmbeddedSignupAssets({
        accessToken: "test-token",
        sessionWabaId: "961217696997428",
        sessionPhoneNumberId: null,
      });
      assert.equal(r.ok, true);
      if (r.ok) {
        assert.equal(r.resolved.wabaId, "961217696997428");
        assert.equal(r.resolved.phoneNumberId, "1191517910720500");
        assert.equal(r.method, "session_waba_single_phone");
      }
      assert.equal(calls.some((u) => u.includes("/me/businesses")), false);
      assert.equal(calls.some((u) => u.includes("/phone_numbers")), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("completion path wires coexistence_direct_session_assets and never uses /me/businesses for coexistence", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(src, /shouldUseDirectSessionAssetValidation/);
    assert.match(src, /coexistence_direct_session_assets/);
    assert.match(src, /isDirectSessionAssetValidationEnabled/);
    const methodIdx = src.indexOf('coexistence_direct_session_assets');
    assert.ok(methodIdx > 0);
    const directBlock = src.slice(methodIdx - 800, methodIdx + 2200);
    assert.match(directBlock, /resolveV4EmbeddedSignupAssets/);
    assert.match(directBlock, /usedMeBusinessesEnumeration:\s*false/);
    assert.doesNotMatch(directBlock, /fetchUserWabaChoices/);
    // No Graph call to /me/businesses in the direct branch (comments may mention the endpoint).
    assert.doesNotMatch(directBlock, /fetch\(\s*[`"'].*me\/businesses/);
    assert.doesNotMatch(directBlock, /\$\{base\}\/me\/businesses/);
  });

  it("persists coexistence connection type and never registers phone", () => {
    const main = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(main, /connectionType = row\.flow === "coexistence" \? "coexistence"/);
    const reg = fs.readFileSync(path.join(process.cwd(), "server/whatsappPhoneRegister.ts"), "utf8");
    assert.match(reg, /coexistence_forbidden/);
  });
});

describe("Coexistence SDK code exchange omits redirect_uri", () => {
  it("omits redirect_uri for coexistence SDK even when architecture label is v2", () => {
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v2",
        flow: "coexistence",
      }),
      true,
    );
    const built = buildWhatsappEmbeddedSignupCodeExchangeUrl({
      graphBase: "https://graph.facebook.com/v21.0",
      clientId: "810621184995059",
      clientSecret: "test-secret",
      code: "test-code",
      includeRedirectUri: !shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v2",
        flow: "coexistence",
      }),
    });
    assert.equal(built.redirectUriSent, false);
    assert.doesNotMatch(built.url, /redirect_uri=/);
  });

  it("still includes redirect_uri for coexistence redirect OAuth", () => {
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "redirect",
        architecture: "v2",
        flow: "coexistence",
      }),
      false,
    );
    const built = buildWhatsappEmbeddedSignupCodeExchangeUrl({
      graphBase: "https://graph.facebook.com/v21.0",
      clientId: "810621184995059",
      clientSecret: "test-secret",
      code: "test-code",
      includeRedirectUri: true,
      redirectUri: BASE.META_WHATSAPP_REDIRECT_URI,
    });
    assert.equal(built.redirectUriSent, true);
    assert.match(built.url, /redirect_uri=/);
  });

  it("standard v4 SDK still omits; standard v2 SDK still includes", () => {
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v4",
        flow: "embedded",
      }),
      true,
    );
    assert.equal(
      shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange({
        tokenExchange: "sdk",
        architecture: "v2",
        flow: "embedded",
      }),
      false,
    );
  });

  it("completeEmbeddedSignupOAuth uses flow-aware omit helper (not architecture===v4 alone)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(src, /shouldOmitRedirectUriForWhatsappEmbeddedSignupCodeExchange/);
    assert.match(src, /omitted_for_coexistence_sdk/);
    assert.doesNotMatch(
      src,
      /omitRedirectUriForSdkV4 = tokenExchange === "sdk" && architecture === "v4"/,
    );
  });
});

describe("Provisioning: no Standard /register for coexistence", () => {
  it("registration policy never requires /register when coexistence=true", () => {
    assert.equal(
      isMetaPhoneCloudApiRegistrationRequired(
        { status: "PENDING", codeVerificationStatus: "VERIFIED", platformType: "CLOUD_API" },
        { coexistence: true, isTestNumber: false },
      ),
      false,
    );
  });

  it("phone register route forbids coexistence users", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/whatsappPhoneRegister.ts"), "utf8");
    assert.match(src, /metaConnectionType === "coexistence"/);
    assert.match(src, /coexistence_forbidden/);
  });

  it("session start uses coexistence login options builder", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/whatsappEmbeddedSignup.ts"), "utf8");
    assert.match(src, /buildCoexistenceEmbeddedSignupLoginOptions/);
    assert.match(src, /flow === "coexistence"/);
  });
});

describe("Sticky connection type", () => {
  it("preserves coexistence on reconnect/manual refresh without architecture change", () => {
    assert.equal(
      resolvePersistedMetaConnectionType({
        previousType: "coexistence",
        requestedType: "manual_legacy",
        allowArchitectureChange: false,
      }),
      "coexistence",
    );
    assert.equal(
      resolvePersistedMetaConnectionType({
        previousType: "coexistence",
        requestedType: "embedded",
        allowArchitectureChange: false,
      }),
      "coexistence",
    );
  });

  it("allows explicit OAuth architecture change", () => {
    assert.equal(
      resolvePersistedMetaConnectionType({
        previousType: "coexistence",
        requestedType: "embedded",
        allowArchitectureChange: true,
      }),
      "embedded",
    );
    assert.equal(
      resolvePersistedMetaConnectionType({
        previousType: "embedded",
        requestedType: "coexistence",
        allowArchitectureChange: true,
      }),
      "coexistence",
    );
  });

  it("connectUserMeta uses sticky resolver", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/userMeta.ts"), "utf8");
    assert.match(src, /resolvePersistedMetaConnectionType/);
    assert.match(src, /allowArchitectureChange/);
  });
});

describe("Readiness + account_update recovery", () => {
  it("partial coexistence setup is not fullyReady", () => {
    const r = evaluateMetaWhatsAppReadiness({
      whatsappProvider: "meta",
      metaConnected: true,
      metaBusinessAccountId: "111111111111111",
      metaPhoneNumberId: "222222222222222",
      metaWebhookSubscribed: false,
      metaIntegrationStatus: "connected",
      metaConnectionType: "coexistence",
    });
    assert.equal(r.fullyReady, false);
    assert.equal(r.setupIncomplete, true);
  });

  it("coexistence CONNECTED + NOT_VERIFIED is fullyReady when webhook/WABA/phone saved", () => {
    const r = evaluateMetaWhatsAppReadiness(
      {
        whatsappProvider: "meta",
        metaConnected: true,
        metaBusinessAccountId: "111111111111111",
        metaPhoneNumberId: "222222222222222",
        metaWebhookSubscribed: true,
        metaIntegrationStatus: "connected",
        metaConnectionType: "coexistence",
      },
      {
        phoneGraphStatus: "CONNECTED",
        phoneGraphCodeVerification: "NOT_VERIFIED",
        phoneGraphPlatformType: "CLOUD_API",
      },
    );
    assert.equal(r.phoneStatusReady, true);
    assert.equal(r.fullyReady, true);
    assert.equal(r.setupIncomplete, false);
  });

  it("standard embedded CONNECTED + NOT_VERIFIED remains not fullyReady", () => {
    const r = evaluateMetaWhatsAppReadiness(
      {
        whatsappProvider: "meta",
        metaConnected: true,
        metaBusinessAccountId: "111111111111111",
        metaPhoneNumberId: "222222222222222",
        metaWebhookSubscribed: true,
        metaIntegrationStatus: "connected",
        metaConnectionType: "embedded",
      },
      {
        phoneGraphStatus: "CONNECTED",
        phoneGraphCodeVerification: "NOT_VERIFIED",
        phoneGraphPlatformType: "CLOUD_API",
      },
    );
    assert.equal(r.phoneStatusReady, false);
    assert.equal(r.fullyReady, false);
    assert.equal(r.setupIncomplete, true);
  });

  it("coexistence still blocks DISCONNECTED / PENDING", () => {
    const base = {
      whatsappProvider: "meta",
      metaConnected: true,
      metaBusinessAccountId: "111111111111111",
      metaPhoneNumberId: "222222222222222",
      metaWebhookSubscribed: true,
      metaIntegrationStatus: "connected",
      metaConnectionType: "coexistence",
    };
    assert.equal(
      evaluateMetaWhatsAppReadiness(base, {
        phoneGraphStatus: "DISCONNECTED",
        phoneGraphCodeVerification: "NOT_VERIFIED",
        phoneGraphPlatformType: "CLOUD_API",
      }).fullyReady,
      false,
    );
    assert.equal(
      evaluateMetaWhatsAppReadiness(base, {
        phoneGraphStatus: "PENDING",
        phoneGraphCodeVerification: "VERIFIED",
        phoneGraphPlatformType: "CLOUD_API",
      }).fullyReady,
      false,
    );
  });

  it("parses supported partner-removed account_update", () => {
    const ev = parseMetaWhatsappAccountUpdate({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "waba-1",
          changes: [
            {
              field: "account_update",
              value: { event: "PARTNER_REMOVED", phone_number_id: "555555555555555" },
            },
          ],
        },
      ],
    });
    assert.ok(ev);
    assert.equal(ev!.kind, "partner_removed");
    assert.equal(ev!.phoneNumberId, "555555555555555");
  });

  it("ignores unsupported account_update shapes", () => {
    assert.equal(
      parseMetaWhatsappAccountUpdate({
        object: "whatsapp_business_account",
        entry: [{ id: "waba-1", changes: [{ field: "account_update", value: { event: "SOMETHING_WEIRD" } }] }],
      }),
      null,
    );
  });

  it("webhook wires account_update handler", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/routes.ts"), "utf8");
    assert.match(src, /parseMetaWhatsappAccountUpdate/);
    assert.match(src, /applyCoexistenceAccountUpdateAttention/);
  });

  it("disconnect clears CRM only (no Meta deregister call)", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "server/userMeta.ts"), "utf8");
    assert.match(src, /WhachatCRM-only disconnect/);
    assert.doesNotMatch(src, /\/deregister/);
  });
});

describe("Dead routes stay dead", () => {
  it("start__disabled remains 404", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "server/routes/whatsappIntegrationRoutes.ts"),
      "utf8",
    );
    assert.match(src, /start__disabled[\s\S]*?status\(404\)/);
  });
});
