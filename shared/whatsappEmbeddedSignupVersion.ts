/**
 * WhatsApp Embedded Signup architecture versioning (v2 vs v4).
 *
 * Distinct from:
 * - signup purpose (`embedded` | `coexistence`)
 * - sessionInfoVersion (payload shape for older ES versions)
 * - Meta Graph API version
 *
 * Official Meta references:
 * - https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions
 * - https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/version-4
 */

export const WHATSAPP_EMBEDDED_SIGNUP_ARCHITECTURES = ["v2", "v4"] as const;
export type WhatsappEmbeddedSignupArchitecture =
  (typeof WHATSAPP_EMBEDDED_SIGNUP_ARCHITECTURES)[number];

export const WHATSAPP_EMBEDDED_SIGNUP_FLOWS = ["embedded", "coexistence"] as const;
export type WhatsappEmbeddedSignupFlow = (typeof WHATSAPP_EMBEDDED_SIGNUP_FLOWS)[number];

/** Exact origins allowed for Meta Embedded Signup session `window.message` events. */
export const META_EMBEDDED_SIGNUP_SESSION_ORIGINS = [
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://facebook.com",
  "https://www.facebook.com/",
] as const;

const META_ORIGIN_ALLOWLIST = new Set<string>([
  "https://www.facebook.com",
  "https://web.facebook.com",
  "https://facebook.com",
]);

export function isWhatsappEmbeddedSignupArchitecture(
  value: unknown,
): value is WhatsappEmbeddedSignupArchitecture {
  return value === "v2" || value === "v4";
}

export function parseWhatsappEmbeddedSignupArchitecture(
  value: unknown,
): WhatsappEmbeddedSignupArchitecture | null {
  if (isWhatsappEmbeddedSignupArchitecture(value)) return value;
  return null;
}

export function assertValidEmbeddedSignupCombo(params: {
  flow: WhatsappEmbeddedSignupFlow;
  architecture: WhatsappEmbeddedSignupArchitecture;
}): void {
  // Coexistence must not be launched as a "standard v4" experiment in Phase 1.
  if (params.flow === "coexistence" && params.architecture === "v4") {
    throw new Error(
      "Invalid combination: coexistence flow cannot use Embedded Signup architecture v4 in this release.",
    );
  }
}

export function configIdLast4(configId: string | null | undefined): string | null {
  const id = (configId || "").trim();
  if (!id) return null;
  return id.length <= 4 ? id : id.slice(-4);
}

export function isTrustedMetaEmbeddedSignupOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    // Exact host allowlist — no substring matching.
    const normalized = `${u.protocol}//${u.host}`;
    return META_ORIGIN_ALLOWLIST.has(normalized);
  } catch {
    return false;
  }
}

export type EmbeddedSignupSessionEventKind =
  | "FINISH"
  | "FINISH_ONLY_WABA"
  | "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING"
  | "ERROR"
  | "CANCEL"
  | "OTHER";

export type ParsedEmbeddedSignupSessionEvent = {
  type: "WA_EMBEDDED_SIGNUP";
  event: EmbeddedSignupSessionEventKind;
  rawEvent: string;
  version?: number | string;
  wabaId?: string;
  phoneNumberId?: string;
  businessId?: string;
};

/**
 * Safely parse Meta session logging payloads.
 * Returns null for non-JSON, wrong type, or untrusted shapes.
 */
export function parseEmbeddedSignupSessionMessageData(
  data: unknown,
): ParsedEmbeddedSignupSessionEvent | null {
  let payload: unknown = data;
  if (typeof data === "string") {
    try {
      payload = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.type !== "WA_EMBEDDED_SIGNUP") return null;
  const rawEvent = typeof obj.event === "string" ? obj.event : "";
  if (!rawEvent) return null;

  let event: EmbeddedSignupSessionEventKind = "OTHER";
  if (
    rawEvent === "FINISH" ||
    rawEvent === "FINISH_ONLY_WABA" ||
    rawEvent === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING" ||
    rawEvent === "ERROR" ||
    rawEvent === "CANCEL"
  ) {
    event = rawEvent;
  }

  const nested =
    obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
  /** Meta may send WABA/phone IDs as strings or numbers — normalize without inventing values. */
  const asMetaId = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
  };
  const wabaId = asMetaId(nested.waba_id) ?? asMetaId(nested.wabaId);
  const phoneNumberId = asMetaId(nested.phone_number_id) ?? asMetaId(nested.phoneNumberId);
  const businessId = asMetaId(nested.business_id) ?? asMetaId(nested.businessId);

  return {
    type: "WA_EMBEDDED_SIGNUP",
    event,
    rawEvent,
    version: typeof obj.version === "number" || typeof obj.version === "string" ? obj.version : undefined,
    wabaId,
    phoneNumberId,
    businessId,
  };
}

export type StandardEmbeddedSignupLoginOptions = {
  config_id: string;
  response_type: "code";
  override_default_response_type: true;
  scope: string;
  extras: Record<string, unknown>;
};

const DEFAULT_SCOPES =
  "whatsapp_business_management,whatsapp_business_messaging,business_management";

/** Coexistence Login for Business: WhatsApp scopes only — never business_management for /me/businesses. */
const COEXISTENCE_SCOPES =
  "whatsapp_business_management,whatsapp_business_messaging";

/**
 * Build FB.login options for **standard** Embedded Signup only.
 * Coexistence `featureType` must never be added here.
 *
 * Meta Versions doc (v4): extras is purposely empty; v4 is selected via a dedicated
 * Facebook Login for Business configuration (config_id), not by sessionInfoVersion alone.
 */
export function buildStandardEmbeddedSignupLoginOptions(params: {
  architecture: WhatsappEmbeddedSignupArchitecture;
  configId: string;
  scope?: string;
}): StandardEmbeddedSignupLoginOptions {
  const configId = params.configId.trim();
  if (!configId) {
    throw new Error("configId is required to build Embedded Signup login options");
  }
  const scope = params.scope?.trim() || DEFAULT_SCOPES;

  if (params.architecture === "v4") {
    return {
      config_id: configId,
      response_type: "code",
      override_default_response_type: true,
      scope,
      // Official v4: extras object purposely empty.
      extras: {},
    };
  }

  // Production v2 path (current live public flow).
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    scope,
    extras: {
      setup: {},
      feature: "whatsapp_embedded_signup",
      sessionInfoVersion: "2",
    },
  };
}

/**
 * Build FB.login options for WhatsApp Business App Coexistence only.
 * Uses dedicated META_WHATSAPP_COEXISTENCE_CONFIG_ID + Meta's coexistence featureType.
 * Never used for Standard Embedded Signup (v2 or v4).
 *
 * Note: Coexistence sessions store architectureVersion "v2" as the Embedded Signup
 * OAuth architecture label required by this product path — that is NOT the same as
 * the legacy public Standard Embedded Signup v2 product rollout.
 */
export function buildCoexistenceEmbeddedSignupLoginOptions(params: {
  configId: string;
  scope?: string;
}): StandardEmbeddedSignupLoginOptions {
  const configId = params.configId.trim();
  if (!configId) {
    throw new Error("configId is required to build Coexistence Embedded Signup login options");
  }
  const scope = params.scope?.trim() || COEXISTENCE_SCOPES;
  return {
    config_id: configId,
    response_type: "code",
    override_default_response_type: true,
    scope,
    extras: {
      setup: {},
      featureType: "whatsapp_business_app_onboarding",
      sessionInfoVersion: "3",
    },
  };
}

/** Env-name helpers for config isolation tests / diagnostics. */
export const EMBEDDED_SIGNUP_CONFIG_ENV = {
  v2: "META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID",
  v4: "META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID",
  coexistence: "META_WHATSAPP_COEXISTENCE_CONFIG_ID",
} as const;

/**
 * Resolve which env-backed config ID string to use.
 * Never silently substitutes across v2 / v4 / coexistence.
 */
export function resolveEmbeddedSignupConfigIdFromEnv(
  flow: WhatsappEmbeddedSignupFlow,
  architecture: WhatsappEmbeddedSignupArchitecture,
  env: NodeJS.ProcessEnv = process.env,
): { envName: string; configId: string } {
  assertValidEmbeddedSignupCombo({ flow, architecture });

  if (flow === "coexistence") {
    const configId = env.META_WHATSAPP_COEXISTENCE_CONFIG_ID?.trim() || "";
    if (!configId) {
      throw new Error(
        "META_WHATSAPP_COEXISTENCE_CONFIG_ID is required for coexistence — create a separate Embedded Signup configuration in Meta and set this env var.",
      );
    }
    return { envName: EMBEDDED_SIGNUP_CONFIG_ENV.coexistence, configId };
  }

  if (architecture === "v4") {
    const configId = env.META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID?.trim() || "";
    if (!configId) {
      throw new Error(
        "META_WHATSAPP_EMBEDDED_SIGNUP_V4_CONFIG_ID is required for Embedded Signup architecture v4.",
      );
    }
    return { envName: EMBEDDED_SIGNUP_CONFIG_ENV.v4, configId };
  }

  const configId = env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || "";
  if (!configId) {
    throw new Error("META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID is not configured.");
  }
  return { envName: EMBEDDED_SIGNUP_CONFIG_ENV.v2, configId };
}

/** Rollout gate + architecture selection live in whatsappEmbeddedSignupRollout.ts */
export {
  readEmbeddedSignupV4GateFromEnv,
  selectEmbeddedSignupArchitecture,
  evaluateEmbeddedSignupV4Prerequisites,
  embeddedSignupV4RolloutBucket,
  parseEmbeddedSignupV4RolloutMode,
  parseEmbeddedSignupV4RolloutPercent,
  buildSanitizedV4RolloutConfigSummary,
  type WhatsappEmbeddedSignupV4RolloutMode,
  type EmbeddedSignupArchitectureSelection,
  type V4PrerequisitesResult,
} from "./whatsappEmbeddedSignupRollout";
