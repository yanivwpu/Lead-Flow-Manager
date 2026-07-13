/**
 * Authenticate Google Cloud Pub/Sub push JWTs (OIDC).
 */
import { OAuth2Client } from "google-auth-library";
import { resolveGmailPubSubConfig, logGmailPushEvent } from "./gmailPushConfig";

const oauthClient = new OAuth2Client();

export type PubSubAuthResult =
  | { ok: true; serviceAccountEmail: string }
  | { ok: false; status: 401 | 403; reason: string };

export function assertPubSubJwtClaims(params: {
  payload: {
    iss?: string;
    email?: string;
    email_verified?: boolean;
    aud?: string | string[];
  };
  audience: string;
  pushServiceAccount: string;
}): { ok: true; serviceAccountEmail: string } | { ok: false; status: 401 | 403; reason: string } {
  const iss = String(params.payload.iss || "");
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    return { ok: false, status: 401, reason: "bad_issuer" };
  }
  const aud = params.payload.aud;
  const audOk = Array.isArray(aud)
    ? aud.includes(params.audience)
    : String(aud || "") === params.audience;
  if (!audOk) {
    return { ok: false, status: 401, reason: "wrong_audience" };
  }
  const email = String(params.payload.email || "")
    .trim()
    .toLowerCase();
  if (!email || email !== params.pushServiceAccount.toLowerCase()) {
    return { ok: false, status: 403, reason: "wrong_service_account" };
  }
  if (params.payload.email_verified === false) {
    return { ok: false, status: 403, reason: "email_unverified" };
  }
  return { ok: true, serviceAccountEmail: email };
}

export async function authenticateGmailPubSubRequest(
  authorizationHeader: string | undefined,
): Promise<PubSubAuthResult> {
  const config = resolveGmailPubSubConfig();
  if (!config.configured) {
    logGmailPushEvent("auth_rejected", { reason: "pubsub_not_configured" });
    return { ok: false, status: 403, reason: "pubsub_not_configured" };
  }

  const raw = String(authorizationHeader || "").trim();
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  if (!match?.[1]) {
    logGmailPushEvent("auth_rejected", { reason: "missing_bearer" });
    return { ok: false, status: 401, reason: "missing_bearer" };
  }

  const token = match[1].trim();
  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: config.audience,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      logGmailPushEvent("auth_rejected", { reason: "empty_payload" });
      return { ok: false, status: 401, reason: "empty_payload" };
    }

    const checked = assertPubSubJwtClaims({
      payload,
      audience: config.audience,
      pushServiceAccount: config.pushServiceAccount,
    });
    if (!checked.ok) {
      logGmailPushEvent("auth_rejected", { reason: checked.reason });
      return checked;
    }
    return checked;
  } catch {
    logGmailPushEvent("auth_rejected", { reason: "jwt_invalid" });
    return { ok: false, status: 401, reason: "jwt_invalid" };
  }
}
