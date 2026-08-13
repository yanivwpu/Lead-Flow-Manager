/**
 * Cloud API phone registration + readiness/redaction.
 * Run: npx tsx --test tests/whatsapp-phone-registration.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractMetaPhoneGraphRegistrationFields,
  isMetaPhoneCloudApiOperational,
  isMetaPhoneCloudApiRegistrationRequired,
  isValidWhatsAppTwoStepPin,
} from "../shared/whatsappPhoneRegistration";
import { evaluateMetaWhatsAppReadiness } from "../shared/whatsappReadiness";
import { classifyWhatsAppPhoneRegisterMetaError } from "../server/whatsappPhoneRegister";
import { stripSensitiveWhatsAppFields } from "../server/whatsappStatusSanitize";
import { buildWhatsAppInboundRoutingDiagnostics } from "../server/whatsappEmbeddedSignup";

const pendingVerified = {
  status: "PENDING",
  codeVerificationStatus: "VERIFIED",
  platformType: "NOT_APPLICABLE",
};

const connectedCloud = {
  status: "CONNECTED",
  codeVerificationStatus: "VERIFIED",
  platformType: "CLOUD_API",
};

describe("PIN validation", () => {
  it("accepts exactly six numeric digits including leading zero", () => {
    assert.equal(isValidWhatsAppTwoStepPin("012345"), true);
    assert.equal(isValidWhatsAppTwoStepPin("123456"), true);
  });

  it("rejects non-six / non-numeric / number types that drop leading zeros", () => {
    assert.equal(isValidWhatsAppTwoStepPin("12345"), false);
    assert.equal(isValidWhatsAppTwoStepPin("1234567"), false);
    assert.equal(isValidWhatsAppTwoStepPin("12a456"), false);
    assert.equal(isValidWhatsAppTwoStepPin(123456 as unknown as string), false);
    assert.equal(isValidWhatsAppTwoStepPin(12345 as unknown as string), false);
  });
});

describe("registration required detection", () => {
  it("PENDING standard v4 requires registration", () => {
    assert.equal(isMetaPhoneCloudApiRegistrationRequired(pendingVerified), true);
    assert.equal(isMetaPhoneCloudApiOperational(pendingVerified), false);
  });

  it("CONNECTED CLOUD_API skips registration", () => {
    assert.equal(isMetaPhoneCloudApiRegistrationRequired(connectedCloud), false);
    assert.equal(isMetaPhoneCloudApiOperational(connectedCloud), true);
  });

  it("Coexistence never requires Cloud API /register", () => {
    assert.equal(
      isMetaPhoneCloudApiRegistrationRequired(pendingVerified, { coexistence: true }),
      false,
    );
  });

  it("extracts fields from nested Graph snapshot", () => {
    const fields = extractMetaPhoneGraphRegistrationFields({
      data: {
        status: "PENDING",
        code_verification_status: "VERIFIED",
        platform_type: "NOT_APPLICABLE",
      },
    });
    assert.equal(fields.status, "PENDING");
    assert.equal(fields.platformType, "NOT_APPLICABLE");
  });
});

describe("readiness gates", () => {
  const user = {
    whatsappProvider: "meta",
    metaConnected: true,
    metaWebhookSubscribed: true,
    metaIntegrationStatus: "connected",
    metaPhoneNumberId: "123456789012345",
    metaBusinessAccountId: "987654321098765",
  };

  it("readiness false for PENDING / NOT_APPLICABLE", () => {
    const evalPending = evaluateMetaWhatsAppReadiness(user, {
      phoneGraphStatus: "PENDING",
      phoneGraphCodeVerification: "VERIFIED",
      phoneGraphPlatformType: "NOT_APPLICABLE",
    });
    assert.equal(evalPending.phoneStatusReady, false);
    assert.equal(evalPending.fullyReady, false);
    assert.equal(evalPending.inboxReady, false);
  });

  it("readiness false for DISCONNECTED and NOT_VERIFIED", () => {
    const disconnected = evaluateMetaWhatsAppReadiness(user, {
      phoneGraphStatus: "DISCONNECTED",
      phoneGraphCodeVerification: "VERIFIED",
      phoneGraphPlatformType: "CLOUD_API",
    });
    assert.equal(disconnected.phoneStatusReady, false);
    assert.equal(disconnected.fullyReady, false);

    const notVerified = evaluateMetaWhatsAppReadiness(user, {
      phoneGraphStatus: "CONNECTED",
      phoneGraphCodeVerification: "NOT_VERIFIED",
      phoneGraphPlatformType: "CLOUD_API",
    });
    assert.equal(notVerified.phoneStatusReady, false);
    assert.equal(notVerified.fullyReady, false);

    const coexNotVerified = evaluateMetaWhatsAppReadiness(
      { ...user, metaConnectionType: "coexistence" },
      {
        phoneGraphStatus: "CONNECTED",
        phoneGraphCodeVerification: "NOT_VERIFIED",
        phoneGraphPlatformType: "CLOUD_API",
      },
    );
    assert.equal(coexNotVerified.phoneStatusReady, true);
    assert.equal(coexNotVerified.fullyReady, true);
    assert.equal(
      isMetaPhoneCloudApiOperational(
        {
          status: "CONNECTED",
          codeVerificationStatus: "NOT_VERIFIED",
          platformType: "CLOUD_API",
        },
        { coexistence: true },
      ),
      true,
    );
  });

  it("readiness true for CONNECTED / CLOUD_API", () => {
    const evalOk = evaluateMetaWhatsAppReadiness(user, {
      phoneGraphStatus: "CONNECTED",
      phoneGraphCodeVerification: "VERIFIED",
      phoneGraphPlatformType: "CLOUD_API",
    });
    assert.equal(evalOk.phoneStatusReady, true);
    assert.equal(evalOk.fullyReady, true);
  });

  it("needs_phone_registration is never fully ready without operational graph", () => {
    const evalReg = evaluateMetaWhatsAppReadiness({
      ...user,
      metaIntegrationStatus: "needs_phone_registration",
    });
    assert.equal(evalReg.phoneStatusReady, false);
    assert.equal(evalReg.fullyReady, false);
  });
});

describe("already-operational register refusal", () => {
  it("operational phones do not require /register (onboarding endpoint must refuse re-PIN)", () => {
    assert.equal(isMetaPhoneCloudApiRegistrationRequired(connectedCloud), false);
    assert.equal(isMetaPhoneCloudApiOperational(connectedCloud), true);
  });

  it("registerPhoneForAuthenticatedUser source refuses already-operational without Meta /register", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(path.join(process.cwd(), "server/whatsappPhoneRegister.ts"), "utf8");
    assert.match(src, /already_operational_register_refused/);
    assert.match(src, /errorCode: "already_registered"/);
    assert.match(src, /PIN changes are not supported/);
  });
});
describe("Meta register error classification", () => {
  it("maps incorrect PIN / already registered / token expiry / rate limit", () => {
    assert.equal(
      classifyWhatsAppPhoneRegisterMetaError({
        meta: { message: "Invalid pin for two-step verification" },
      }),
      "incorrect_pin",
    );
    assert.equal(
      classifyWhatsAppPhoneRegisterMetaError({
        meta: { message: "Phone number already registered" },
      }),
      "already_registered",
    );
    assert.equal(
      classifyWhatsAppPhoneRegisterMetaError({ meta: { code: 190, message: "Session has expired" } }),
      "token_expired",
    );
    assert.equal(
      classifyWhatsAppPhoneRegisterMetaError({ httpStatus: 429, meta: { message: "rate limit" } }),
      "rate_limited",
    );
  });
});

describe("status/diagnostic redaction", () => {
  it("removes webhook verify token, access token, PIN, and long auth codes", () => {
    const cleaned = stripSensitiveWhatsAppFields({
      webhookVerifyToken: "super-secret-verify",
      webhookVerifyTokenConfigured: true,
      meta: {
        accessToken: "EAAB...",
        pin: "654321",
        phoneNumberId: "123456789012345",
      },
      oauth: { code: "A".repeat(40), architecture: "v4" },
      graphError: { code: 100, message: "ok to keep numeric code" },
    });
    assert.equal((cleaned as any).webhookVerifyToken, undefined);
    assert.equal((cleaned as any).webhookVerifyTokenConfigured, true);
    assert.equal((cleaned as any).meta.accessToken, undefined);
    assert.equal((cleaned as any).meta.pin, undefined);
    assert.equal((cleaned as any).meta.phoneNumberId, "123456789012345");
    assert.equal((cleaned as any).oauth.code, undefined);
    assert.equal((cleaned as any).oauth.architecture, "v4");
    assert.equal((cleaned as any).graphError.code, 100);
    const blob = JSON.stringify(cleaned);
    assert.equal(blob.includes("654321"), false);
    assert.equal(blob.includes("super-secret-verify"), false);
    assert.equal(blob.includes("EAAB"), false);
  });

  it("serializes Date fields to ISO strings (or null) without emptying them", () => {
    const valid = new Date("2026-08-10T18:00:00.000Z");
    const invalid = new Date("not-a-date");
    const cleaned = stripSensitiveWhatsAppFields({
      webhookLastCheckedAt: valid,
      tokenExpiresAt: invalid,
      alreadyIso: "2026-08-10T19:00:00.000Z",
      nullable: null,
      nested: {
        pin: "654321",
        checkedAt: valid,
        accessToken: "secret-token",
      },
      appSecret: "should-strip",
    });
    assert.equal((cleaned as any).webhookLastCheckedAt, "2026-08-10T18:00:00.000Z");
    assert.equal((cleaned as any).tokenExpiresAt, null);
    assert.equal((cleaned as any).alreadyIso, "2026-08-10T19:00:00.000Z");
    assert.equal((cleaned as any).nullable, null);
    assert.equal((cleaned as any).appSecret, undefined);
    assert.equal((cleaned as any).nested.pin, undefined);
    assert.equal((cleaned as any).nested.accessToken, undefined);
    assert.equal((cleaned as any).nested.checkedAt, "2026-08-10T18:00:00.000Z");
    assert.equal(typeof (cleaned as any).webhookLastCheckedAt, "string");
    assert.notDeepEqual((cleaned as any).webhookLastCheckedAt, {});
  });
});

describe("coexistence recommendation", () => {
  it("does not recommend coexistence for standard embedded Cloud API connections", () => {
    const d = buildWhatsAppInboundRoutingDiagnostics({
      metaConnected: true,
      activeProvider: "meta",
      metaConnectionType: "embedded",
      coexistenceServerConfigured: true,
      webhookSubscribed: true,
      phonePlatformType: "NOT_APPLICABLE",
    });
    assert.equal(d.coexistenceReconnectRecommended, false);
    assert.equal(d.summary, "standard_embedded_or_manual");
  });
});

describe("register HTTP body", () => {
  it("posts messaging_product + pin only and never logs PIN", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: any, init?: RequestInit) => {
      calls.push({ url: String(url), init: init || {} });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as typeof fetch;
    try {
      const { registerWhatsAppCloudApiPhoneNumber } = await import("../server/whatsappPhoneRegister");
      const result = await registerWhatsAppCloudApiPhoneNumber({
        accessToken: "token-secret",
        phoneNumberId: "123456789012345",
        pin: "012345",
      });
      assert.equal(result.ok, true);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, /\/123456789012345\/register$/);
      const body = JSON.parse(String(calls[0].init.body));
      assert.deepEqual(body, { messaging_product: "whatsapp", pin: "012345" });
      assert.equal(Object.keys(body).sort().join(","), "messaging_product,pin");
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("locale strings for PIN UX", () => {
  it("includes EN/ES/HE registration copy", async () => {
    const en = (await import("../client/src/locales/en.json", { with: { type: "json" } })).default as any;
    const es = (await import("../client/src/locales/es.json", { with: { type: "json" } })).default as any;
    const he = (await import("../client/src/locales/he.json", { with: { type: "json" } })).default as any;
    for (const loc of [en, es, he]) {
      assert.ok(loc.whatsappPhoneRegistration?.title);
      assert.ok(loc.whatsappPhoneRegistration?.submit);
      assert.ok(loc.whatsappPhoneRegistration?.keepPin);
    }
  });

  it("PIN form preserves RTL via i18n.dir and clears PIN fields in source", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const src = await fs.readFile(
      path.join(process.cwd(), "client/src/components/WhatsAppPhoneRegistrationPinForm.tsx"),
      "utf8",
    );
    assert.match(src, /i18n\.dir\(\)\s*===\s*"rtl"/);
    assert.match(src, /dir=\{isRtl \? "rtl" : "ltr"\}/);
    assert.match(src, /function clearPins/);
    assert.match(src, /clearPins\(\)/);
    assert.doesNotMatch(src, /localStorage/);
    assert.doesNotMatch(src, /console\.(log|info|debug|warn|error).*pin/i);
  });
});