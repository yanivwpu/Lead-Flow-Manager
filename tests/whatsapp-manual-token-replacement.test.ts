import { validateManualMetaTokenReplacement, MetaTokenReplacementError } from "../shared/manualMetaTokenReplacementValidation";

const connected = {
  metaConnected: true,
  whatsappProvider: "meta",
  metaConnectionType: "manual_legacy",
  metaPhoneNumberId: "1144480422078565",
  metaBusinessAccountId: "967263072832328",
};
const nowSeconds = 1792580000;
const valid = {
  connected, token: "EAABCDEFGHIJKLMNOPQRSTUVWXY123456789",
  expectedAppId: "810621184995059",
  debug: {
    ok: true, is_valid: true, app_id: "810621184995059",
    expires_at: nowSeconds + 3600,
    scopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
  },
  graphPhoneIds: ["1144480422078565"],
  nowSeconds,
};
function assert(condition: unknown, message: string) { if (!condition) throw Error(message); }
function reject(name: string, data: Partial<typeof valid>, expected: string) {
  try {
    validateManualMetaTokenReplacement({ ...valid, ...data });
  } catch(e) {
    assert(e instanceof MetaTokenReplacementError && e.code === expected, name + " yielded wrong failure");
    return;
  }
  throw Error(name + " unexpectedly accepted");
}
const value = validateManualMetaTokenReplacement(valid);
assert(value.expiresAt?.getTime() === (nowSeconds + 3600) * 1000, "expiry must be preserved");
assert(validateManualMetaTokenReplacement({ ...valid, debug: {...valid.debug, expires_at: 0} }).expiresAt === null, "nonexpiring token is allowed");
reject("other provider", { connected: {...connected, whatsappProvider: "twilio"} }, "not_manual_connection");
reject("embedded signup", { connected: {...connected, metaConnectionType: "embedded_signup"} }, "not_manual_connection");
reject("disconnected account", { connected: {...connected, metaConnected: false} }, "not_manual_connection");
reject("wrong Meta app", { debug: {...valid.debug, app_id: "99999999999"} }, "wrong_meta_app");
reject("unverified token", { debug: {...valid.debug, is_valid: false} }, "wrong_meta_app");
reject("expired token", { debug: {...valid.debug, expires_at: nowSeconds-5} }, "token_expires_too_soon");
reject("too-short validity", { debug: {...valid.debug, expires_at: nowSeconds + 100} }, "token_expires_too_soon");
reject("missing scope", { debug: {...valid.debug, scopes: ["whatsapp_business_messaging"]} }, "missing_permissions");
reject("wrong phone", { graphPhoneIds: ["999999999999999"] }, "phone_waba_mismatch");
reject("bad IDs", { connected: {...connected, metaBusinessAccountId: "malformed"} }, "not_manual_connection");
reject("blank token", { token: " " }, "invalid_token");
console.log("WhatsApp manual token replacement gate tests passed");
