import { safeTextLinks } from "@shared/safeTextLinks";
/**
 * Display plain-text Prospect AI outreach as readable HTML email.
 * Presentation only: never change approved text or destination URLs.
 * Escape all untrusted prospect/AI content before introducing trusted anchor markup.
 */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function linkifyLine(line: string, approvedUrls: string[], preserveAuthoredUrls: boolean): string {
  return safeTextLinks(line, !preserveAuthoredUrls, approvedUrls).map(part => {
    if (!part.href) return escapeHtml(part.text);
    // Only URLs explicitly configured/approved for the campaign become a CTA.
    // All other authored links keep their original visible URL text, and the
    // actual validated href is never replaced or modified.
    const approved = approvedUrls.some(url => !!url && url === part.href);
    const label = approved
      ? (part.href === "https://www.whachatcrm.com/realtor-growth-engine"
        ? "Explore the Realtor Growth Engine"
        : "Learn more")
      : part.text;
    const style = approved
      ? "display:inline-block;margin:4px 0;padding:11px 17px;border-radius:8px;background-color:#087f78;color:#ffffff;font-weight:700;text-decoration:none;line-height:1.4"
      : "color:#0369a1;text-decoration:underline";
    return "<a href=\"" + escapeHtml(part.href) + "\" style=\"" + style +
      "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(label) + "</a>";
  }).join("");
}

/**
 * Occasionally imported/serialized email drafts contain a literal backslash-n
 * sequence instead of a line break. Repair it at the final send/preview boundary
 * so that an adjacent URL never absorbs "\\n\\nNext" into its href.
 * Genuine CRLF and Unicode text are preserved.
 */
export function normalizeProspectOutreachEmailText(value: string): string {
  return String(value || "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\r\n?/g, "\n");
}

export function renderProspectOutreachEmailHtml(rawText: string, approvedUrls: string[] = [], preserveAuthoredUrls = false): string {
  const normalized = normalizeProspectOutreachEmailText(rawText).trim();
  if (!normalized) return "";
  const paragraphs = normalized.split(/\n[ \t]*\n+/).map((paragraph) =>
    "<p dir=\"auto\" style=\"margin:0 0 16px;line-height:1.55\">" +
      paragraph.split("\n").map(line => linkifyLine(line, approvedUrls, preserveAuthoredUrls)).join("<br>") + "</p>"
  );
  return "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#172b4d;max-width:680px\">" + paragraphs.join("") + "</div>";
}
