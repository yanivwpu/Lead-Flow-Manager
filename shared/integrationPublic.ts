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
  "consumerKey",
  "consumerSecret",
  "pageAccessToken",
  "page_access_token",
] as const;

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

/** Public shape: never include raw accessToken / refreshToken columns. */
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
