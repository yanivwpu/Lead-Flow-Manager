/**
 * Explicit browser-safe user DTO. Never serialize a raw users-row.
 * Allowlist only — new DB columns must be added here to appear in API clients.
 */

export const USER_CLIENT_DTO_KEYS = [
  "id",
  "name",
  "email",
  "avatarUrl",
  "role",
  "language",
  "emailVerifiedAt",
  "deletionRequestedAt",
  "onboardingCompleted",
  "twilioConnected",
  "metaConnected",
  "whatsappProvider",
] as const;

export type UserClientDtoKey = (typeof USER_CLIENT_DTO_KEYS)[number];

/** Fields that must never appear on a user/workspace payload sent to the browser. */
export const USER_CLIENT_FORBIDDEN_KEYS = [
  "password",
  "passwordHash",
  "metaAccessToken",
  "metaAppSecret",
  "metaWebhookVerifyToken",
  "metaLastOAuthDebug",
  "metaPhoneNumberId",
  "metaBusinessAccountId",
  "metaTokenExpiresAt",
  "telegramWebhookSecret",
  "telegramWebhookPublicId",
  "tiktokLeadPublicId",
  "shopifyAccessToken",
  "shopifyChargeId",
  "shopifyOwnerEmail",
  "twilioAuthToken",
  "twilioAccountSid",
  "twilioWhatsappNumber",
  "pushSubscription",
  "stripeCustomerId",
  "stripeSubscriptionId",
  "widgetPublicId",
  "widgetPublicIdRotatedAt",
  "accessToken",
  "refreshToken",
  "webhookSecret",
  "webhookVerifyToken",
  "verifyToken",
] as const;

export type UserClientDto = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
  language?: string | null;
  emailVerifiedAt?: string | null;
  deletionRequestedAt?: string | null;
  onboardingCompleted?: boolean;
  twilioConnected?: boolean;
  metaConnected?: boolean;
  whatsappProvider?: string | null;
};

function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") return value;
  return null;
}

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

export function toClientUser(user: unknown): UserClientDto {
  const row = user && typeof user === "object" ? (user as Record<string, unknown>) : {};
  const id = typeof row.id === "string" ? row.id : "";
  return {
    id,
    name: typeof row.name === "string" ? row.name : "",
    email: typeof row.email === "string" ? row.email : "",
    avatarUrl: pickString(row.avatarUrl),
    role: pickString(row.role),
    language: pickString(row.language),
    emailVerifiedAt: isoOrNull(row.emailVerifiedAt),
    deletionRequestedAt: isoOrNull(row.deletionRequestedAt),
    onboardingCompleted: row.onboardingCompleted === true,
    twilioConnected: row.twilioConnected === true,
    metaConnected: row.metaConnected === true,
    whatsappProvider: pickString(row.whatsappProvider),
  };
}

export function clientUserForbiddenKeysPresent(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const keys = Object.keys(payload as Record<string, unknown>);
  const forbidden = new Set<string>(USER_CLIENT_FORBIDDEN_KEYS);
  return keys.filter((key) => forbidden.has(key));
}

/** Admin attribution list — identity + source only, never credentials. */
export function toAdminUserAttributionDto(user: unknown): Record<string, unknown> {
  const row = user && typeof user === "object" ? (user as Record<string, unknown>) : {};
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "",
    email: typeof row.email === "string" ? row.email : "",
    source: typeof row.source === "string" ? row.source : null,
    partnerName: typeof row.partnerName === "string" ? row.partnerName : null,
    salespersonName: typeof row.salespersonName === "string" ? row.salespersonName : null,
    createdAt: isoOrNull(row.createdAt),
    subscriptionPlan: typeof row.subscriptionPlan === "string" ? row.subscriptionPlan : null,
  };
}
