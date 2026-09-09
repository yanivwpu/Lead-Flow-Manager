/**
 * Strip secrets from integration objects returned to API clients / logs.
 */

const SENSITIVE_CONFIG_KEYS = [
  "accessToken",
  "secretKey",
  "privateKey",
  "clientSecret",
  "refreshToken",
  "apiKey",
  "webhookSecret",
  "webhookSigningKey",
  "webhookVerifyToken",
  "verifyToken",
  "consumerKey",
  "consumerSecret",
  "pageAccessToken",
  "page_access_token",
  "botToken",
  "authToken",
  "accountSid",
  "appSecret",
  "encryptedAccessToken",
] as const;

/** Non-secret channel fields the Settings UI may display. */
const CHANNEL_PUBLIC_CONFIG_KEYS = ["pageName", "pageId", "instagramAccountId"] as const;

export function maskIntegrationConfig(
  config: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const masked: Record<string, unknown> = { ...config };
  for (const key of SENSITIVE_CONFIG_KEYS) {
    if (masked[key] && typeof masked[key] === "string") {
      masked[key] = "••••••••";
    }
  }
  return masked;
}

/** Channel settings row for the browser — public config keys only, never tokens/secrets. */
export function toPublicChannelSetting<T extends Record<string, unknown>>(setting: T): T {
  const configRaw = (setting as T & { config?: unknown }).config;
  const config =
    configRaw && typeof configRaw === "object" ? (configRaw as Record<string, unknown>) : {};
  const publicConfig: Record<string, unknown> = {};
  for (const key of CHANNEL_PUBLIC_CONFIG_KEYS) {
    if (config[key] != null && config[key] !== "") {
      publicConfig[key] = config[key];
    }
  }
  const { accessToken: _a, refreshToken: _r, ...rest } = setting as T & {
    accessToken?: unknown;
    refreshToken?: unknown;
  };
  return { ...rest, config: publicConfig } as T;
}

export function toPublicIntegration<T extends Record<string, unknown>>(integration: T): T {
  const {
    accessToken: _a,
    refreshToken: _r,
    ...rest
  } = integration as T & { accessToken?: unknown; refreshToken?: unknown };
  const config = rest.config;
  return {
    ...rest,
    config: maskIntegrationConfig(
      config && typeof config === "object" ? (config as Record<string, unknown>) : {},
    ),
    hasAccessToken: Boolean(_a),
    hasRefreshToken: Boolean(_r),
  } as T;
}

export function redactSecretsInText(text: string): string {
  return text
    .replace(/("access_token"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("refresh_token"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("accessToken"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("refreshToken"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("authorizationCode"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("client_secret"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"')
    .replace(/("clientSecret"\s*:\s*")[^"]+"/gi, '$1[REDACTED]"');
}
