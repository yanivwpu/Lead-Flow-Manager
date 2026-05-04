/**
 * Inbox outbound attachment rules before upload/send.
 * WhatsApp: documents allowed (Meta + Twilio `sendWhatsAppMedia` supports `document`).
 * Facebook Messenger / Instagram DMs: documents blocked by Meta messaging APIs.
 */
export function outboundDocumentBlockHint(
  channel: string | null | undefined,
  mediaType: string
): string | null {
  if (mediaType !== "document") return null;
  const c = (channel || "").toLowerCase();
  if (c === "facebook") {
    return "PDF files aren't supported on Facebook Messenger. Send an image, video, or audio instead.";
  }
  if (c === "instagram") {
    return "PDF files aren't supported on Instagram DMs. Send an image, video, or audio instead.";
  }
  return null;
}
