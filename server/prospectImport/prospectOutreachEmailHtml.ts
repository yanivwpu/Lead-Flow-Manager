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

function linkifyLine(line: string): string {
  return safeTextLinks(line).map(part => part.href
    ? "<a href=\"" + escapeHtml(part.href) + "\" style=\"color:#0369a1;text-decoration:underline\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(part.text) + "</a>"
    : escapeHtml(part.text)).join("");
}

export function renderProspectOutreachEmailHtml(rawText: string): string {
  const normalized = String(rawText || "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const paragraphs = normalized.split(/\n[ \t]*\n+/).map((paragraph) =>
    "<p style=\"margin:0 0 16px;line-height:1.55\">" +
      paragraph.split("\n").map(linkifyLine).join("<br>") + "</p>"
  );
  return "<div style=\"font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#172b4d;max-width:680px\">" + paragraphs.join("") + "</div>";
}
