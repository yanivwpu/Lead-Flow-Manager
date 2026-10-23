/** Parse safe http(s) URLs while retaining original text and punctuation. */
export function safeTextLinks(text: string, prose = false, approvedUrls: string[] = []): Array<{ text: string; href?: string }> {
  const parts: Array<{ text: string; href?: string }> = [];
  let cursor = 0;
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/gi)) {
    const index = match.index!;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    // URL punctuation is data. Whitespace or angle/attribute delimiters end tokens.
    let href = prose ? match[0].replace(/[.,;:!?،؛؟。！？，、…]+$/g, "") : match[0];
    if (prose) for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (href.endsWith(close) && href.split(close).length > href.split(open).length) href = href.slice(0, -1);
    }
    if (prose) for (const [open,close] of [["'","'"],["“","”"],["‘","’"],["«","»"],["‹","›"],["„","“"],["「","」"],["『","』"]]) {
      if (text[index - 1] === open && href.endsWith(close)) href = href.slice(0,-close.length);
    }
    if (prose) {
      const approved = approvedUrls.filter(url => url && match[0].startsWith(url) && /^[.,;:!?،؛؟。！？，、…\)\]\}'”’»›“」』]*$/.test(match[0].slice(url.length))).sort((a,b) => b.length-a.length)[0];
      if (approved) href = approved;
    }
    try {
      const url = new URL(href);
      if (!url.hostname || url.username || url.password || !["https:", "http:"].includes(url.protocol)) throw new Error();
      parts.push({ text: href, href });
      if (match[0].length > href.length) parts.push({ text: match[0].slice(href.length) });
    } catch { parts.push({ text: match[0] }); }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts;
}
