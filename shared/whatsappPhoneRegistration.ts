/**
 * WhatsApp Cloud API phone registration helpers (standard Embedded Signup).
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration
 */

export type MetaPhoneGraphRegistrationFields = {
  status?: string | null;
  codeVerificationStatus?: string | null;
  platformType?: string | null;
};

function upper(v: string | null | undefined): string {
  return String(v ?? "").trim().toUpperCase();
}

/** Six numeric digits as a string (preserves leading zeros). */
export function isValidWhatsAppTwoStepPin(pin: unknown): pin is string {
  return typeof pin === "string" && /^\d{6}$/.test(pin);
}

/**
 * True when Graph reports an operational Cloud API phone for messaging.
 * Standard Embedded Signup: NOT_APPLICABLE / PENDING / DISCONNECTED / NOT_VERIFIED are never ready.
 * Coexistence: NOT_VERIFIED is allowed when status is CONNECTED (Business App numbers often stay NOT_VERIFIED).
 */
export function isMetaPhoneCloudApiOperational(
  input: MetaPhoneGraphRegistrationFields,
  opts?: { coexistence?: boolean },
): boolean {
  const status = upper(input.status);
  const code = upper(input.codeVerificationStatus);
  const platform = upper(input.platformType);

  if (status !== "CONNECTED") return false;
  if (code === "NOT_VERIFIED" && !opts?.coexistence) return false;
  if (platform === "NOT_APPLICABLE") return false;
  // When Meta supplies platform_type, prefer CLOUD_API; empty/missing is allowed if CONNECTED.
  if (platform && platform !== "CLOUD_API") return false;
  return true;
}

/**
 * Standard Embedded Signup numbers that are verified but not yet Cloud-API operational
 * need POST /{phone-number-id}/register. Never for Coexistence.
 */
export function isMetaPhoneCloudApiRegistrationRequired(
  input: MetaPhoneGraphRegistrationFields,
  opts?: { coexistence?: boolean; isTestNumber?: boolean },
): boolean {
  if (opts?.coexistence) return false;
  if (opts?.isTestNumber) return false;
  if (isMetaPhoneCloudApiOperational(input, { coexistence: opts?.coexistence })) return false;

  const status = upper(input.status);
  const code = upper(input.codeVerificationStatus);
  const platform = upper(input.platformType);

  if (code === "NOT_VERIFIED") return false;
  if (status === "DISCONNECTED") return false;

  if (status === "PENDING") return true;
  if (platform === "NOT_APPLICABLE") return true;
  // Verified but no usable Cloud API platform/status yet.
  if ((code === "VERIFIED" || !code) && status !== "CONNECTED") return true;
  return false;
}

export function extractMetaPhoneGraphRegistrationFields(
  snapshot: Record<string, unknown> | null | undefined,
): MetaPhoneGraphRegistrationFields {
  const inner =
    snapshot?.data && typeof snapshot.data === "object"
      ? (snapshot.data as Record<string, unknown>)
      : snapshot;
  if (!inner || typeof inner !== "object") return {};
  return {
    status: inner.status != null ? String(inner.status) : null,
    codeVerificationStatus:
      inner.code_verification_status != null ? String(inner.code_verification_status) : null,
    platformType: inner.platform_type != null ? String(inner.platform_type) : null,
  };
}
