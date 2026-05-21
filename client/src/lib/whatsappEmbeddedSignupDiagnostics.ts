/** User-facing copy when Meta blocks FB.login (dev mode, missing tester role, etc.). */
export const META_EMBEDDED_SIGNUP_BLOCKED_MESSAGE =
  "Meta is temporarily blocking the connection. Please contact support so we can verify your WhatsApp onboarding access.";

export function isMetaEmbeddedSignupBlockedError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("feature unavailable") ||
    m.includes("facebook login is currently unavailable") ||
    m.includes("currently unavailable for this app") ||
    m.includes("login is currently unavailable")
  );
}

export function redactFbLoginResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") return { raw: String(response) };
  const r = response as Record<string, unknown>;
  const auth = r.authResponse as Record<string, unknown> | undefined;
  return {
    status: r.status ?? null,
    hasAuthResponse: !!auth,
    hasCode: !!(auth && typeof auth.code === "string"),
    error: r.error ?? null,
    error_reason: r.error_reason ?? null,
    error_message: r.error_message ?? r.errorMessage ?? null,
  };
}

export function inferMetaLoginFailureMessage(response: unknown): string | null {
  const r = response as Record<string, unknown> | null;
  if (!r) return null;
  const msg = String(r.error_message ?? r.errorMessage ?? r.error_description ?? "").trim();
  if (msg) return msg;
  const status = String(r.status ?? "");
  if (status && status !== "connected" && !r.authResponse) {
    return `Meta login status: ${status}`;
  }
  return null;
}

export async function postWhatsappEmbeddedSignupDiagnostics(
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("/api/integrations/whatsapp/meta/signup-diagnostics", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* non-blocking */
  }
}

export function buildEmbeddedSignupPreLoginDiagnostics(input: {
  phase: string;
  loginMethod: "embedded_signup";
  appId: string | null | undefined;
  configId: string | null | undefined;
  graphVersion: string | null | undefined;
  userId?: string | null;
  userEmail?: string | null;
  sdkLoaded: boolean;
  sdkPriorAppId?: string | null;
  cfgAppId?: string | null;
  cfgEmbeddedConfigId?: string | null;
  appIdMissing?: boolean;
  configIdMissing?: boolean;
  appIdMatchesInstagramAppId?: boolean;
  embeddedSignupEnabled?: boolean;
}): Record<string, unknown> {
  const origin = typeof window !== "undefined" ? window.location.origin : null;
  return {
    phase: input.phase,
    loginMethod: input.loginMethod,
    appId: input.appId || null,
    appIdTail: input.appId ? input.appId.slice(-6) : null,
    configId: input.configId || null,
    configIdTail: input.configId ? input.configId.slice(-8) : null,
    graphVersion: input.graphVersion || null,
    userId: input.userId || null,
    userEmail: input.userEmail || null,
    url: typeof window !== "undefined" ? window.location.href : null,
    origin,
    hostname: typeof window !== "undefined" ? window.location.hostname : null,
    sdkLoaded: input.sdkLoaded,
    sdkPriorAppId: input.sdkPriorAppId || null,
    cfgAppId: input.cfgAppId || null,
    cfgEmbeddedConfigId: input.cfgEmbeddedConfigId || null,
    appIdMissing: !!input.appIdMissing,
    configIdMissing: !!input.configIdMissing,
    appIdMatchesInstagramAppId: !!input.appIdMatchesInstagramAppId,
    embeddedSignupEnabled: !!input.embeddedSignupEnabled,
    appIdSource: "META_APP_ID",
  };
}
