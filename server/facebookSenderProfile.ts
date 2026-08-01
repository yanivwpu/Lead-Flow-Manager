/**
 * Facebook Messenger sender profile lookup (Page-scoped PSID → display name).
 * Uses the receiving Page's access token only. Never logs raw tokens.
 */

import {
  composeFacebookDisplayName,
  isFacebookNamePlaceholder,
} from "@shared/facebookContactNaming";
import { sanitizeMetaError } from "./metaFacebookReconnectDiag";

export type FacebookSenderProfile = {
  displayName: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  profilePic: string | null;
  fieldsReturned: string[];
};

const PROFILE_FIELDS = "name,first_name,last_name,profile_pic";

export async function fetchFacebookSenderProfile(
  senderPsid: string,
  pageAccessToken: string,
  opts?: { pageIdForLog?: string | null; userIdForLog?: string | null },
): Promise<FacebookSenderProfile | null> {
  const token = (pageAccessToken || "").trim();
  if (!senderPsid || !token) return null;

  console.info("[Meta Webhook] [FB PROFILE] fetch attempted", {
    senderId: senderPsid,
    pageId: opts?.pageIdForLog ?? null,
    userId: opts?.userIdForLog ?? null,
    fields: PROFILE_FIELDS.split(","),
  });

  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(senderPsid)}` +
        `?fields=${encodeURIComponent(PROFILE_FIELDS)}` +
        `&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    const returned = ["name", "first_name", "last_name", "profile_pic"].filter(
      (f) => data[f] != null,
    );

    if (!resp.ok) {
      const metaError = sanitizeMetaError(resp.status, data);
      console.warn("[Meta Webhook] [FB PROFILE] fetch failed", {
        senderId: senderPsid,
        pageId: opts?.pageIdForLog ?? null,
        userId: opts?.userIdForLog ?? null,
        httpStatus: metaError.httpStatus,
        code: metaError.code,
        errorSubcode: metaError.errorSubcode,
        type: metaError.type,
        fbtraceId: metaError.fbtraceId,
        message: metaError.message,
        fieldsReturned: returned,
      });
      return null;
    }

    const displayName = composeFacebookDisplayName(data);
    if (!displayName || isFacebookNamePlaceholder(displayName, senderPsid)) {
      console.info("[Meta Webhook] [FB PROFILE] no usable name", {
        senderId: senderPsid,
        pageId: opts?.pageIdForLog ?? null,
        fieldsReturned: returned,
      });
      return null;
    }

    const profilePic =
      typeof data.profile_pic === "string" && data.profile_pic.trim()
        ? data.profile_pic.trim()
        : null;

    console.info("[Meta Webhook] [FB PROFILE] fetch success", {
      senderId: senderPsid,
      pageId: opts?.pageIdForLog ?? null,
      fieldsReturned: returned,
      hasName: !!displayName,
      hasProfilePic: !!profilePic,
    });

    return {
      displayName,
      name: typeof data.name === "string" ? data.name : null,
      firstName: typeof data.first_name === "string" ? data.first_name : null,
      lastName: typeof data.last_name === "string" ? data.last_name : null,
      profilePic,
      fieldsReturned: returned,
    };
  } catch (err: unknown) {
    console.warn("[Meta Webhook] [FB PROFILE] fetch exception", {
      senderId: senderPsid,
      pageId: opts?.pageIdForLog ?? null,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
