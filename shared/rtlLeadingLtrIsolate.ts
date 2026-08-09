/**
 * Controlled RTL layout for standalone English "AI" before Hebrew text.
 * Branded names (AI Brain, AI Copilot, …) stay intact as LTR isolates.
 *
 * Visual goal for "AI" + Hebrew: AI on the RIGHT, Hebrew to its LEFT
 * (screen LTR reading of the pair: "עברית  AI").
 */

export type HebrewAiBidiSegment =
  | { kind: "text"; text: string }
  | { kind: "brand"; text: string }
  | { kind: "aiHebrew"; ai: string; hebrew: string };

/** Longest-first so "WhachatCRM AI Brain" wins over "AI Brain". */
export const PROTECTED_AI_BRANDS = [
  "WhachatCRM AI Brain",
  "Prospect AI",
  "AI Copilot",
  "AI Brain",
  "AI Assist",
] as const;

const BRAND_PLACEHOLDER = "\uE000"; // private-use; restored after AI+Hebrew split

/** Standalone AI + following Hebrew/punctuation run (stops at Latin letters). */
const STANDALONE_AI_BEFORE_HEBREW =
  /\bAI\s+([\u0590-\u05FF][\u0590-\u05FF\s0-9.,;:!?־׳״"'()—–-]*)/gu;

const FLEX_RTL_STYLE =
  "display:inline-flex;flex-direction:row;flex-wrap:wrap;align-items:baseline;column-gap:0.25rem";

export function splitHebrewAiBidiText(input: string): HebrewAiBidiSegment[] {
  if (!input) return [{ kind: "text", text: "" }];

  // 1) Mask protected brands
  let masked = input;
  const brands: string[] = [];
  for (const brand of PROTECTED_AI_BRANDS) {
    if (!masked.includes(brand)) continue;
    masked = masked.split(brand).join(`${BRAND_PLACEHOLDER}${brands.length}${BRAND_PLACEHOLDER}`);
    brands.push(brand);
  }

  // 2) Split on standalone AI + Hebrew
  const rough: HebrewAiBidiSegment[] = [];
  let last = 0;
  STANDALONE_AI_BEFORE_HEBREW.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = STANDALONE_AI_BEFORE_HEBREW.exec(masked)) !== null) {
    if (match.index > last) {
      rough.push({ kind: "text", text: masked.slice(last, match.index) });
    }
    rough.push({ kind: "aiHebrew", ai: "AI", hebrew: match[1]!.replace(/\s+$/u, "") });
    // Preserve trailing spaces after the Hebrew run as plain text
    const trailing = match[1]!.match(/\s+$/u)?.[0] ?? "";
    if (trailing) rough.push({ kind: "text", text: trailing });
    last = match.index + match[0].length;
  }
  if (last < masked.length) {
    rough.push({ kind: "text", text: masked.slice(last) });
  }

  // 3) Unmask brands inside text segments
  const out: HebrewAiBidiSegment[] = [];
  for (const seg of rough) {
    if (seg.kind !== "text") {
      out.push(seg);
      continue;
    }
    const parts = seg.text.split(
      new RegExp(`${BRAND_PLACEHOLDER}(\\d+)${BRAND_PLACEHOLDER}`, "g"),
    );
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const brand = brands[Number(parts[i])];
        if (brand) out.push({ kind: "brand", text: brand });
      } else if (parts[i]) {
        out.push({ kind: "text", text: parts[i]! });
      }
    }
  }

  return out.length ? out : [{ kind: "text", text: input }];
}

/** True when text needs controlled AI+Hebrew layout (not brand-only). */
export function needsHebrewAiBidiLayout(text: string): boolean {
  return splitHebrewAiBidiText(text).some((s) => s.kind === "aiHebrew");
}

/** Leading-token helper kept for tests / simple H1 detection. */
export function needsLeadingLtrIsolate(heading: string): boolean {
  return needsHebrewAiBidiLayout(heading);
}

export function splitLeadingLtrBeforeHebrew(heading: string): Array<
  | { kind: "ltrIsolate"; text: string }
  | { kind: "text"; text: string }
> {
  const segs = splitHebrewAiBidiText(heading);
  if (segs.length === 2 && segs[0]?.kind === "aiHebrew" && segs[1]?.kind === "text" && !segs[1].text.trim()) {
    return [
      { kind: "ltrIsolate", text: segs[0].ai },
      { kind: "text", text: ` ${segs[0].hebrew}` },
    ];
  }
  if (segs.length === 1 && segs[0]?.kind === "aiHebrew") {
    return [
      { kind: "ltrIsolate", text: segs[0].ai },
      { kind: "text", text: ` ${segs[0].hebrew}` },
    ];
  }
  // Fallback: first aiHebrew at start
  if (segs[0]?.kind === "aiHebrew") {
    const rest = segs
      .slice(1)
      .map((s) => (s.kind === "aiHebrew" ? `${s.ai} ${s.hebrew}` : s.text))
      .join("");
    return [
      { kind: "ltrIsolate", text: segs[0].ai },
      { kind: "text", text: ` ${segs[0].hebrew}${rest}` },
    ];
  }
  return [{ kind: "text", text: heading }];
}

function segmentToHtml(
  seg: HebrewAiBidiSegment,
  escapeText: (value: string) => string,
): string {
  if (seg.kind === "text") return escapeText(seg.text);
  if (seg.kind === "brand") {
    return `<bdi dir="ltr">${escapeText(seg.text)}</bdi>`;
  }
  return (
    `<span dir="rtl" style="${FLEX_RTL_STYLE}">` +
    `<bdi dir="ltr">${escapeText(seg.ai)}</bdi>` +
    `<span> ${escapeText(seg.hebrew)}</span>` +
    `</span>`
  );
}

/** SSR-safe inner HTML with flex RTL groups for standalone AI + Hebrew. */
export function formatHeadingHtmlWithLeadingLtrIsolate(
  heading: string,
  escapeText: (value: string) => string,
): string {
  return splitHebrewAiBidiText(heading)
    .map((seg) => segmentToHtml(seg, escapeText))
    .join("");
}

export function formatHebrewAiBidiHtml(
  text: string,
  escapeText: (value: string) => string,
): string {
  return formatHeadingHtmlWithLeadingLtrIsolate(text, escapeText);
}

/** Comparison H2 parts for Hebrew AI Brain page (RTL flex order = visual right→left). */
export const HE_GENERIC_AI_VS_BRAIN = {
  brand: "WhachatCRM AI Brain",
  vs: "לעומת",
  genericAi: "AI",
  genericLabel: "רגיל",
} as const;

export function formatHeGenericAiVsBrainHtml(
  escapeText: (value: string) => string,
): string {
  const { brand, vs, genericAi, genericLabel } = HE_GENERIC_AI_VS_BRAIN;
  return (
    `<span dir="rtl" style="${FLEX_RTL_STYLE};column-gap:0.5rem">` +
    `<bdi dir="ltr">${escapeText(brand)}</bdi>` +
    `<span>${escapeText(vs)}</span>` +
    `<span dir="rtl" style="${FLEX_RTL_STYLE}">` +
    `<bdi dir="ltr">${escapeText(genericAi)}</bdi>` +
    `<span> ${escapeText(genericLabel)}</span>` +
    `</span>` +
    `</span>`
  );
}
