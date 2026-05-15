/**
 * Map Meta WhatsApp Cloud API error codes (webhook / status) to short fix hints for logs + UI.
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */

export function waMetaWebhookFailureHint(errorCode: string | number | null | undefined): string {
  const c = errorCode == null ? "" : String(errorCode).trim();
  switch (c) {
    case "131049":
      return "WhatsApp blocked this send due to Meta engagement limits. Try another approved template or wait before retrying.";
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
  const code = opts.errorCode != null ? String(opts.errorCode).trim() : "";
  if (code === "131049") {
    return waMetaWebhookFailureHint("131049");
  }
  const hint = waMetaWebhookFailureHint(opts.errorCode);
  const title = typeof opts.errorTitle === "string" ? opts.errorTitle.trim() : "";
  const detail = typeof opts.errorDetail === "string" ? opts.errorDetail.trim() : "";
  const metaParts = [title, detail].filter((x, i, a) => x && a.indexOf(x) === i);
  const metaLine = metaParts.length ? metaParts.join(" — ") : "";
  if (!metaLine) return hint;
  if (code && metaLine.includes(code)) {
    const stripped = hint.replace(new RegExp(`^WhatsApp reported error code\\s*${code}\\.?\\s*`, "i"), "").trim();
    if (stripped) return `${metaLine}\n${stripped}`;
    return metaLine;
  }
  return `${metaLine}\n${hint}`;
}

/** Single user-facing explanation for re-engagement / CRM (code shown separately in UI when available). */
export function reEngagementTemplateDeliveryFailureHint(opts: {
  errorTitle?: string | null;
  errorDetail?: string | null;
  errorCode?: string | number | null;
}): string {
  const code = opts.errorCode != null ? String(opts.errorCode).trim() : "";
  if (code === "131049") {
    return waMetaWebhookFailureHint("131049");
  }
  const title = typeof opts.errorTitle === "string" ? opts.errorTitle.trim() : "";
  const detail = typeof opts.errorDetail === "string" ? opts.errorDetail.trim() : "";
  const metaLine = [title, detail].filter((x, i, a) => x && a.indexOf(x) === i).join(" — ");
  if (metaLine) return metaLine;
  return waMetaWebhookFailureHint(opts.errorCode);
}
