/**
 * Map Meta WhatsApp Cloud API error codes (webhook / status) to short fix hints for logs + UI.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */

export function waMetaWebhookFailureHint(errorCode: string | number | null | undefined): string {
  const c = errorCode == null ? "" : String(errorCode).trim();
  switch (c) {
    case "131053":
      return "Media URL or format rejected by WhatsApp — re-upload to your public bucket as JPEG (images) or H.264+AAC MP4 (video), avoid Meta/WA CDN links.";
    case "131052":
      return "Media download failed — confirm the URL is public HTTPS with 200, correct Content-Type, and Content-Length.";
    case "131051":
      return "Media format not supported — convert to supported types before send.";
    case "131000":
      return "Generic send error — verify template is approved and phone number is opted in.";
    default:
      return c
        ? `WhatsApp reported error code ${c}. Check template media, template approval, and recipient eligibility.`
        : "WhatsApp delivery failed — see error title/message from Meta.";
  }
}

export function formatMetaTemplateDeliveryFailureLine(opts: {
  errorTitle?: string | null;
  errorDetail?: string | null;
  errorCode?: string | number | null;
}): string {
  const hint = waMetaWebhookFailureHint(opts.errorCode);
  const parts = [opts.errorTitle, opts.errorDetail].filter((x) => typeof x === "string" && x.trim()) as string[];
  const base = parts.length ? parts.join(" — ") : "Delivery failed";
  return `${base}\n${hint}`;
}
