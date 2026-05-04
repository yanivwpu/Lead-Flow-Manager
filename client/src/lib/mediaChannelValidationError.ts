/**
 * Expected channel/media validation failures (Meta Messenger, Instagram, etc.)
 * — show inline in the thread only; do not use destructive toasts.
 */
export function isMediaChannelValidationError(message: string): boolean {
  const m = message || "";
  if (m.includes("Facebook Messenger does not support sending documents or PDF files")) return true;
  if (m.includes("Instagram does not support sending documents or PDF files")) return true;
  if (
    m.includes("does not support this file type") &&
    m.includes("documents and PDFs are not supported")
  ) {
    return true;
  }
  return false;
}

/** Calm, product-style copy for the message bubble (no channel-settings finger-pointing). */
export function mediaChannelValidationBubbleText(message: string): string {
  const m = message || "";
  if (m.includes("Facebook Messenger does not support sending documents or PDF files")) {
    return "PDF files aren't supported on Facebook Messenger. Send an image, video, or audio instead.";
  }
  if (m.includes("Instagram does not support sending documents or PDF files")) {
    return "PDF files aren't supported on Instagram DMs. Send an image, video, or audio instead.";
  }
  return "This file type isn't supported on this channel. Send an image, video, or audio instead.";
}
