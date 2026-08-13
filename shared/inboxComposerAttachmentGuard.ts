/**
 * Unified Inbox composer: when to require listing-details text with a pending attachment.
 *
 * Core inbox media (every industry / every user):
 *   - Manual image-only, image+caption, and image+regular text MUST be allowed.
 *   - Never block merely because an attachment exists, the file is an image,
 *     the workspace is Realtor-enabled, RGE is active, or inventory context exists.
 *
 * Listing-specific validation applies ONLY when the attachment was attached via an
 * explicit listing/inventory send action that sets attachmentSource =
 * "listing_recommendation" (Copilot / ListingDetailDialog insert with listing photo).
 */

export type InboxPendingAttachmentSource = "manual_upload" | "listing_recommendation";

export function shouldBlockListingRecommendationMissingText(params: {
  hasPendingAttachment: boolean;
  /**
   * Explicit marker only. Absence / manual_upload / unknown → do not apply
   * listing validation (even in Realtor / RGE workspaces).
   */
  attachmentSource: InboxPendingAttachmentSource | null | undefined;
  messageText: string;
}): boolean {
  if (!params.hasPendingAttachment) return false;
  if (params.attachmentSource !== "listing_recommendation") return false;
  return !String(params.messageText || "").trim();
}
