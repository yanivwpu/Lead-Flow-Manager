export type MetaAttachmentType = "image" | "video" | "audio";

export type MetaOutboundStep =
  | { kind: "text"; text: string }
  | { kind: "attachment"; attachmentType: MetaAttachmentType; url: string };

export function resolveMetaAttachmentType(
  contentType: string | undefined,
  mediaUrl: string,
): MetaAttachmentType {
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct === "video" || ct.includes("video")) return "video";
    if (ct === "audio" || ct.includes("audio")) return "audio";
  }
  const ext = (mediaUrl.split("?")[0].split(".").pop() || "").toLowerCase();
  if (["mp4", "mov", "avi", "webm"].includes(ext)) return "video";
  if (["mp3", "ogg", "wav", "aac", "m4a"].includes(ext)) return "audio";
  return "image";
}

/**
 * Meta Messenger / Instagram Send API allows one payload per message.
 * When both text and media are present, send text first, then attachment.
 */
export function buildMetaOutboundSteps(input: {
  content: string;
  mediaUrl?: string;
  contentType?: string;
}): MetaOutboundStep[] {
  const text = (input.content || "").trim();
  const mediaUrl = (input.mediaUrl || "").trim();
  const steps: MetaOutboundStep[] = [];
  if (text) {
    steps.push({ kind: "text", text });
  }
  if (mediaUrl) {
    steps.push({
      kind: "attachment",
      attachmentType: resolveMetaAttachmentType(input.contentType, mediaUrl),
      url: mediaUrl,
    });
  }
  return steps;
}

/** Listing recommendations must not be image-only on Meta channels. */
export function metaOutboundRequiresTextWithMedia(
  steps: MetaOutboundStep[],
): boolean {
  const hasText = steps.some((s) => s.kind === "text");
  const hasAttachment = steps.some((s) => s.kind === "attachment");
  return hasAttachment && !hasText;
}
