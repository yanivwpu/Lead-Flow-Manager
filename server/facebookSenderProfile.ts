/**
 * Facebook Messenger sender profile lookup (Page-scoped PSID → display name).
 * Uses the receiving Page's access token only. Never logs raw tokens.
 *
 * Strategy:
 * 1) User Profile API GET /{psid}?fields=name,first_name,last_name,profile_pic
 *    (requires Business Asset User Profile Access for many non-admin senders)
 * 2) Fallback GET /{mid}?fields=from — uses from.name only when from.id is present
 *    and exactly equals the webhook sender PSID. Absent from.id is rejected (not trusted).
 *    Callers must pass the exact inbound event message.mid for that sender/conversation.
 */

import {
  composeFacebookDisplayName,
  isFacebookPsidShapedId,
} from "@shared/facebookContactNaming";
import {
  facebookTokenFingerprint,
  sanitizeMetaError,
} from "./metaFacebookReconnectDiag";

export type FacebookSenderProfile = {
  displayName: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePic: string | null;
  fieldsReturned: string[];
  source: "user_profile_api" | "message_from_api";
};

const GRAPH_VERSION = "v19.0";
const USER_PROFILE_FIELDS = "name,first_name,last_name,profile_pic";

export type FacebookProfileLookupContext = {
  pageIdForLog?: string | null;
  userIdForLog?: string | null;
  contactIdForLog?: string | null;
  conversationIdForLog?: string | null;
  messageMid?: string | null;
};

function logFbProfile(event: string, data: Record<string, unknown>): void {
  console.info(`[FB PROFILE] ${JSON.stringify({ event, ...data, ts: new Date().toISOString() })}`);
}

function graphUrl(pathWithQuery: string, token: string): string {
  const join = pathWithQuery.includes("?") ? "&" : "?";
  return (
    `https://graph.facebook.com/${GRAPH_VERSION}${pathWithQuery}` +
    `${join}access_token=${encodeURIComponent(token)}`
  );
}

async function fetchUserProfileApi(
  senderPsid: string,
  pageAccessToken: string,
  ctx: FacebookProfileLookupContext,
): Promise<{
  profile: FacebookSenderProfile | null;
  httpStatus: number;
  metaError: ReturnType<typeof sanitizeMetaError> | null;
  responseHasName: boolean;
  responseHasProfilePic: boolean;
}> {
  const resp = await fetch(
    graphUrl(
      `/${encodeURIComponent(senderPsid)}?fields=${encodeURIComponent(USER_PROFILE_FIELDS)}`,
      pageAccessToken,
    ),
    { signal: AbortSignal.timeout(8000) },
  );
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const returned = ["name", "first_name", "last_name", "profile_pic"].filter(
    (f) => data[f] != null,
  );
  const responseHasName =
    typeof data.name === "string" ||
    typeof data.first_name === "string" ||
    typeof data.last_name === "string";
  const responseHasProfilePic = typeof data.profile_pic === "string";

  if (!resp.ok) {
    return {
      profile: null,
      httpStatus: resp.status,
      metaError: sanitizeMetaError(resp.status, data),
      responseHasName,
      responseHasProfilePic,
    };
  }

  const displayName = composeFacebookDisplayName(data);
  if (!displayName || displayName === senderPsid || isFacebookPsidShapedId(displayName)) {
    return {
      profile: null,
      httpStatus: resp.status,
      metaError: null,
      responseHasName,
      responseHasProfilePic,
    };
  }

  return {
    profile: {
      displayName,
      name: typeof data.name === "string" ? data.name : null,
      firstName: typeof data.first_name === "string" ? data.first_name : null,
      lastName: typeof data.last_name === "string" ? data.last_name : null,
      profilePic:
        typeof data.profile_pic === "string" && data.profile_pic.trim()
          ? data.profile_pic.trim()
          : null,
      fieldsReturned: returned,
      source: "user_profile_api",
    },
    httpStatus: resp.status,
    metaError: null,
    responseHasName,
    responseHasProfilePic,
  };
}

async function fetchProfileFromMessageMid(
  messageMid: string,
  senderPsid: string,
  pageAccessToken: string,
): Promise<{
  profile: FacebookSenderProfile | null;
  httpStatus: number;
  metaError: ReturnType<typeof sanitizeMetaError> | null;
  fromName: string | null;
}> {
  const resp = await fetch(
    graphUrl(
      `/${encodeURIComponent(messageMid)}?fields=${encodeURIComponent("from")}`,
      pageAccessToken,
    ),
    { signal: AbortSignal.timeout(8000) },
  );
  const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    return {
      profile: null,
      httpStatus: resp.status,
      metaError: sanitizeMetaError(resp.status, data),
      fromName: null,
    };
  }
  const from = data.from && typeof data.from === "object" ? (data.from as Record<string, unknown>) : null;
  const fromName = typeof from?.name === "string" && from.name.trim() ? from.name.trim() : null;
  const fromId = from?.id != null ? String(from.id) : null;
  if (!fromName || fromName === senderPsid || isFacebookPsidShapedId(fromName)) {
    return { profile: null, httpStatus: resp.status, metaError: null, fromName };
  }
  // Require from.id and exact PSID match. The MID is already the inbound event's
  // message id (closure-scoped per webhook event), and GET /{mid} with the Page
  // token can only read that Page's message — but we still refuse when Meta omits
  // from.id so we never apply a name without sender identity confirmation.
  if (!fromId || fromId !== senderPsid) {
    return { profile: null, httpStatus: resp.status, metaError: null, fromName };
  }
  return {
    profile: {
      displayName: fromName,
      name: fromName,
      firstName: null,
      lastName: null,
      profilePic: null,
      fieldsReturned: ["from.name", "from.id"],
      source: "message_from_api",
    },
    httpStatus: resp.status,
    metaError: null,
    fromName,
  };
}

/**
 * Resolve Messenger sender display identity using the receiving Page token.
 */
export async function fetchFacebookSenderProfile(
  senderPsid: string,
  pageAccessToken: string,
  opts?: FacebookProfileLookupContext,
): Promise<FacebookSenderProfile | null> {
  const token = (pageAccessToken || "").trim();
  const ctx = opts || {};
  if (!senderPsid || !token) {
    logFbProfile("profile_lookup_skipped", {
      reason: !senderPsid ? "missing_psid" : "missing_token",
      senderPsid: senderPsid || null,
      receivingPageId: ctx.pageIdForLog ?? null,
      userId: ctx.userIdForLog ?? null,
      tokenPresent: Boolean(token),
    });
    return null;
  }

  logFbProfile("profile_lookup_started", {
    senderPsid,
    receivingPageId: ctx.pageIdForLog ?? null,
    userId: ctx.userIdForLog ?? null,
    contactId: ctx.contactIdForLog ?? null,
    conversationId: ctx.conversationIdForLog ?? null,
    messageMid: ctx.messageMid ?? null,
    tokenPresent: true,
    tokenFingerprint: facebookTokenFingerprint(token),
    graphApiVersion: GRAPH_VERSION,
    requestedFields: USER_PROFILE_FIELDS.split(","),
  });

  try {
    const primary = await fetchUserProfileApi(senderPsid, token, ctx);
    logFbProfile("user_profile_api_result", {
      senderPsid,
      receivingPageId: ctx.pageIdForLog ?? null,
      httpStatus: primary.httpStatus,
      metaError: primary.metaError,
      responseHasName: primary.responseHasName,
      responseHasProfilePic: primary.responseHasProfilePic,
      resolved: Boolean(primary.profile),
      source: primary.profile?.source ?? null,
    });

    if (primary.profile) {
      logFbProfile("profile_lookup_success", {
        senderPsid,
        receivingPageId: ctx.pageIdForLog ?? null,
        source: primary.profile.source,
        responseHasName: true,
        responseHasProfilePic: Boolean(primary.profile.profilePic),
        fieldsReturned: primary.profile.fieldsReturned,
      });
      return primary.profile;
    }

    // Fallback: Conversation Message API `from.name` (works when User Profile Access is denied).
    const mid = typeof ctx.messageMid === "string" ? ctx.messageMid.trim() : "";
    if (mid) {
      const fallback = await fetchProfileFromMessageMid(mid, senderPsid, token);
      logFbProfile("message_from_api_result", {
        senderPsid,
        receivingPageId: ctx.pageIdForLog ?? null,
        messageMidPresent: true,
        httpStatus: fallback.httpStatus,
        metaError: fallback.metaError,
        responseHasName: Boolean(fallback.fromName),
        responseHasProfilePic: false,
        resolved: Boolean(fallback.profile),
        source: fallback.profile?.source ?? null,
      });
      if (fallback.profile) {
        // If User Profile failed for name but we might still get a pic later — keep mid name.
        // Optionally merge profile_pic from a second attempt is unnecessary when primary failed hard.
        logFbProfile("profile_lookup_success", {
          senderPsid,
          receivingPageId: ctx.pageIdForLog ?? null,
          source: fallback.profile.source,
          responseHasName: true,
          responseHasProfilePic: false,
          fieldsReturned: fallback.profile.fieldsReturned,
          note: "Used message from.name fallback after User Profile API denial/empty",
        });
        return fallback.profile;
      }
    } else {
      logFbProfile("message_from_api_skipped", {
        senderPsid,
        receivingPageId: ctx.pageIdForLog ?? null,
        reason: "missing_message_mid",
      });
    }

    logFbProfile("profile_lookup_exhausted", {
      senderPsid,
      receivingPageId: ctx.pageIdForLog ?? null,
      userProfileHttpStatus: primary.httpStatus,
      userProfileMetaError: primary.metaError,
    });
    return null;
  } catch (err: unknown) {
    logFbProfile("profile_lookup_exception", {
      senderPsid,
      receivingPageId: ctx.pageIdForLog ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
