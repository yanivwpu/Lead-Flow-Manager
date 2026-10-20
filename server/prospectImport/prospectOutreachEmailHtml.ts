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
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;
  let output = "";
  for (const match of line.matchAll(urlPattern)) {
    const index = match.index ?? 0;
    const raw = match[0];
    output += escapeHtml(line.slice(cursor, index));
    // Punctuation terminating prose must not become part of the URL.
    const url = raw.replace(/[.,;:!?)}\]]+$/g, "");
    const punctuation = raw.slice(url.length);
    let safe = false;
    try {
      const parsed = new URL(url);
      safe = (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !!parsed.hostname && !parsed.username && !parsed.password;
    } catch {
      safe = false;
    }
    output += safe
      ? "<a href=\"" + escapeHtml(url) + "\" style=\"color:#0369a1;text-decoration:underline\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(url) + "</a>" + escapeHtml(punctuation)
      : escapeHtml(raw);
    cursor = index + raw.length;
  }
  return output + escapeHtml(line.slice(cursor));
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
