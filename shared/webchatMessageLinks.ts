/**
 * Presentation-only http(s) URL splitting for Website Chat bubbles.
 * Does not mutate saved message content or AI output.
 */

export type LinkedTextPart =
  | { type: "text"; value: string }
  | { type: "url"; href: string; display: string };

const HTTP_URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const TRAILING_PUNCT = new Set([".", ",", ")", "]", "!", "?"]);

export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  const value = String(raw || "").trim();
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return Boolean(url.hostname) && /[a-z0-9]/i.test(url.hostname);
  } catch {
    return false;
  }
}

function countChar(text: string, ch: string): number {
  let n = 0;
  for (const c of text) if (c === ch) n += 1;
  return n;
}

/** Strip sentence punctuation that is not part of the URL. Keep balanced ) / ]. */
export function splitTrailingUrlPunctuation(raw: string): { url: string; trailing: string } {
  let url = raw;
  let trailing = "";
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (!TRAILING_PUNCT.has(last)) break;
    if (last === ")" && countChar(url, "(") >= countChar(url, ")")) break;
    if (last === "]" && countChar(url, "[") >= countChar(url, "]")) break;
    url = url.slice(0, -1);
    trailing = last + trailing;
  }
  return { url, trailing };
}

export function splitTextWithHttpUrls(text: string | null | undefined): LinkedTextPart[] {
  const value = String(text ?? "");
  if (!value) return [];

  const parts: LinkedTextPart[] = [];
  let lastIndex = 0;
  const matches = value.matchAll(HTTP_URL_RE);

  for (const match of matches) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (start > lastIndex) {
      parts.push({ type: "text", value: value.slice(lastIndex, start) });
    }

    const { url, trailing } = splitTrailingUrlPunctuation(matched);
    if (isSafeHttpUrl(url)) {
      parts.push({ type: "url", href: url, display: url });
      if (trailing) parts.push({ type: "text", value: trailing });
    } else {
      parts.push({ type: "text", value: matched });
    }
    lastIndex = start + matched.length;
  }

  if (lastIndex < value.length) {
    parts.push({ type: "text", value: value.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value }];
}
