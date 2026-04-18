/**
 * avatarService.ts
 *
 * Fetches and caches real profile photos for channels that expose them reliably.
 * Channel-by-channel support matrix:
 *   Facebook Messenger — Graph API profile_pic field (URL, expires ~hours; refreshed weekly)
 *   Instagram DM      — Graph API profile_pic field (same as above)
 *   Telegram          — getUserProfilePhotos + getFile; image downloaded and stored as
 *                       base64 data URL so the bot token never appears in a stored URL
 *   WhatsApp / SMS / Webchat — platform does not expose a usable avatar; skipped.
 *
 * All fetches are fire-and-forget: the caller should not await them.
 * Failures are swallowed silently; the initials fallback in ChatAvatar handles it.
 */

import { storage } from "./storage";
import type { Contact } from "@shared/schema";

const REFRESH_DAYS = 7;

/**
 * Returns true when the contact's avatar should be re-fetched from the channel API.
 * Triggers on first-ever fetch (avatarFetchedAt is null) or when the last fetch
 * was more than REFRESH_DAYS ago (to handle Meta CDN URL expiry and Telegram updates).
 */
export function shouldRefreshAvatar(
  contact: Pick<Contact, "avatarFetchedAt">
): boolean {
  if (!contact.avatarFetchedAt) return true;
  const msSince = Date.now() - new Date(contact.avatarFetchedAt).getTime();
  return msSince > REFRESH_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Fetches a Facebook Messenger sender's profile picture via the Graph API and
 * stores the CDN URL in contacts.avatar.
 *
 * The caller is expected to have already resolved the sender's display name; this
 * function only updates the avatar field (and avatarFetchedAt).
 */
export async function fetchFacebookAvatar(
  contactId: string,
  psid: string,
  accessToken: string
): Promise<void> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(psid)}?fields=profile_pic&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = (await resp.json()) as Record<string, unknown>;
    const avatarUrl = typeof data.profile_pic === "string" ? data.profile_pic : null;
    await storage.updateContact(contactId, {
      ...(avatarUrl ? { avatar: avatarUrl } : {}),
      avatarFetchedAt: new Date(),
    });
    if (avatarUrl) {
      console.log(`[Avatar] Facebook avatar stored for contact ${contactId}`);
    } else {
      console.log(`[Avatar] No Facebook profile_pic returned for contact ${contactId} (${(data as any)?.error?.message ?? "unknown"})`);
    }
  } catch (err: unknown) {
    console.log(`[Avatar] Facebook avatar fetch failed for contact ${contactId}: ${(err as Error).message ?? err}`);
  }
}

/**
 * Fetches an Instagram DM sender's profile picture via the Graph API.
 * Uses the same endpoint shape as Facebook: GET /{igsid}?fields=profile_pic
 */
export async function fetchInstagramAvatar(
  contactId: string,
  igsid: string,
  accessToken: string
): Promise<void> {
  try {
    const resp = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(igsid)}?fields=profile_pic&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = (await resp.json()) as Record<string, unknown>;
    const avatarUrl = typeof data.profile_pic === "string" ? data.profile_pic : null;
    await storage.updateContact(contactId, {
      ...(avatarUrl ? { avatar: avatarUrl } : {}),
      avatarFetchedAt: new Date(),
    });
    if (avatarUrl) {
      console.log(`[Avatar] Instagram avatar stored for contact ${contactId}`);
    } else {
      console.log(`[Avatar] No Instagram profile_pic returned for contact ${contactId} (${(data as any)?.error?.message ?? "unknown"})`);
    }
  } catch (err: unknown) {
    console.log(`[Avatar] Instagram avatar fetch failed for contact ${contactId}: ${(err as Error).message ?? err}`);
  }
}

/**
 * Fetches a Telegram user's profile photo via the Bot API.
 *
 * The image is downloaded and stored as a base64 data-URI so the bot token never
 * appears in a URL that the browser requests.  Profile photos are typically small
 * JPEGs (~10-40 KB), so storing ~40-55 KB of base64 in the contacts.avatar text
 * column is acceptable.
 */
export async function fetchTelegramAvatar(
  contactId: string,
  chatId: string,
  botToken: string
): Promise<void> {
  const base = `https://api.telegram.org/bot${botToken}`;
  try {
    // 1. Get the most recent profile photo metadata
    const photosResp = await fetch(
      `${base}/getUserProfilePhotos?user_id=${encodeURIComponent(chatId)}&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    const photosData = (await photosResp.json()) as any;
    if (!photosResp.ok || !photosData.ok || !photosData.result?.total_count) {
      // User has no public profile photo — mark as attempted
      await storage.updateContact(contactId, { avatarFetchedAt: new Date() });
      console.log(`[Avatar] Telegram: no profile photo for chatId=${chatId}`);
      return;
    }

    // Each photo has multiple sizes; take the largest (last in array)
    const sizeArray: any[] = photosData.result.photos[0];
    const largest = sizeArray[sizeArray.length - 1];
    const fileId: string = largest.file_id;

    // 2. Resolve file_id → file_path
    const fileResp = await fetch(
      `${base}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const fileData = (await fileResp.json()) as any;
    if (!fileResp.ok || !fileData.ok || !fileData.result?.file_path) {
      await storage.updateContact(contactId, { avatarFetchedAt: new Date() });
      console.log(`[Avatar] Telegram: getFile failed for chatId=${chatId}`);
      return;
    }

    // 3. Download the image bytes using the token-bearing URL (server-side only)
    const imgResp = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`,
      { signal: AbortSignal.timeout(15000) }
    );
    if (!imgResp.ok) {
      await storage.updateContact(contactId, { avatarFetchedAt: new Date() });
      console.log(`[Avatar] Telegram: image download failed for chatId=${chatId} (HTTP ${imgResp.status})`);
      return;
    }

    // 4. Convert to base64 data-URI and persist
    const buf = await imgResp.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const dataUrl = `data:image/jpeg;base64,${b64}`;
    await storage.updateContact(contactId, { avatar: dataUrl, avatarFetchedAt: new Date() });
    console.log(`[Avatar] Telegram avatar stored for contact ${contactId} (${Math.round(b64.length / 1024)} KB base64)`);
  } catch (err: unknown) {
    console.log(`[Avatar] Telegram avatar fetch failed for contact ${contactId}: ${(err as Error).message ?? err}`);
  }
}
