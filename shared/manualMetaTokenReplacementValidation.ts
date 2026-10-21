/** Pure validation for replacing only an existing manually attached Meta token. */

export class MetaTokenReplacementError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export type ManualMetaTokenContext = {
  metaConnected?: boolean | null;
  whatsappProvider?: string | null;
  metaConnectionType?: string | null;
  metaPhoneNumberId?: string | null;
  metaBusinessAccountId?: string | null;
};

type MetaTokenDebug = {
  ok: boolean;
  is_valid?: boolean | null;
  app_id?: string | null;
  expires_at?: number | null;
  scopes?: string[] | null;
};

export function validateManualMetaTokenReplacement(input: {
  connected: ManualMetaTokenContext;
  expectedAppId: string;
  token: string;
  debug: MetaTokenDebug;
  graphPhoneIds: string[];
  nowSeconds: number;
}): { expiresAt: Date | null } {
  const { connected: u, expectedAppId, token, debug, graphPhoneIds, nowSeconds } = input;
  if (
    !u.metaConnected ||
    u.whatsappProvider !== "meta" ||
    u.metaConnectionType !== "manual_legacy" ||
    !/^\d{8,}$/.test(String(u.metaPhoneNumberId ?? "")) ||
    !/^\d{8,}$/.test(String(u.metaBusinessAccountId ?? ""))
  ) {
    throw new MetaTokenReplacementError("not_manual_connection", "This action is only for an existing manual Meta WhatsApp connection.");
  }
  if (token.length < 20 || token.length > 8192 || /\s/.test(token)) {
    throw new MetaTokenReplacementError("invalid_token", "Enter a valid Meta access token.");
  }
  if (
    !expectedAppId ||
    debug.ok !== true ||
    debug.is_valid !== true ||
    String(debug.app_id ?? "") !== expectedAppId
  ) {
    throw new MetaTokenReplacementError("wrong_meta_app", "Meta token is invalid or belongs to a different app.");
  }
  const scopes = new Set(debug.scopes ?? []);
  if (!scopes.has("whatsapp_business_messaging") || !scopes.has("whatsapp_business_management")) {
    throw new MetaTokenReplacementError("missing_permissions", "This token must include WhatsApp messaging and management permissions.");
  }
  if (!graphPhoneIds.includes(String(u.metaPhoneNumberId))) {
    throw new MetaTokenReplacementError("phone_waba_mismatch", "The token does not have access to this connected phone number under its existing WhatsApp Business Account.");
  }
  const expiry = debug.expires_at && debug.expires_at > 0 ? debug.expires_at : null;
  if (expiry !== null && expiry <= nowSeconds + 300) {
    throw new MetaTokenReplacementError("token_expires_too_soon", "This Meta token is expired or expires in under five minutes. Generate a new token.");
  }
  return { expiresAt: expiry === null ? null : new Date(expiry * 1000) };
}

