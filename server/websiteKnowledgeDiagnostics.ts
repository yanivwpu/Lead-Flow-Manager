/**
 * TEMPORARY [WK-DIAG] instrumentation — remove once the Website Knowledge pricing
 * loss point is identified.
 *
 * Emits one structured stdout line per pipeline stage so the first stage that drops
 * pricing can be identified from production logs. Deliberately logs only derived
 * signals: never page content, prompts, customer messages, generated replies,
 * secrets, or environment values.
 */

const TAG = "[WK-DIAG]";
const MAX_TOKENS = 20;
const MAX_PLAN_NAMES = 12;

const PRICE_RE = /\$\s?\d[\d.,]*/g;
/** Short label immediately preceding a currency amount, e.g. "Business Listing — $29". */
const PLAN_NAME_RE = /([A-Za-z][A-Za-z0-9&'’ -]{2,48}?)\s*(?:[—–\-:]|\bfrom\b|\bfor\b|\bis\b)?\s*\$\s?\d/g;

export type PriceSignals = {
  chars: number;
  priceCount: number;
  priceTokens: string[];
  planNames: string[];
};

/** Public list prices and plan labels only — no surrounding prose. */
export function priceSignals(input: string | null | undefined): PriceSignals {
  const text = String(input || "");
  const tokens = text.match(PRICE_RE) || [];
  const uniqueTokens = [...new Set(tokens.map((t) => t.replace(/\s+/g, "")))];

  const planNames: string[] = [];
  const seenNames = new Set<string>();
  for (const match of text.matchAll(PLAN_NAME_RE)) {
    // Keep the trailing few words so a whole sentence can never be captured.
    const label = (match[1] || "").trim().split(/\s+/).slice(-4).join(" ").trim();
    if (label.length < 3 || label.length > 40) continue;
    const dedupe = label.toLowerCase();
    if (seenNames.has(dedupe)) continue;
    seenNames.add(dedupe);
    planNames.push(label);
    if (planNames.length >= MAX_PLAN_NAMES) break;
  }

  return {
    chars: text.length,
    priceCount: tokens.length,
    priceTokens: uniqueTokens.slice(0, MAX_TOKENS),
    planNames,
  };
}

/** Path only — never query strings, which can carry identifiers. */
export function safePath(url: string | null | undefined): string {
  const raw = String(url || "");
  if (!raw) return "";
  try {
    return new URL(raw).pathname.slice(0, 120) || "/";
  } catch {
    return "(unparseable)";
  }
}

export function newWkTrace(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function wkDiag(event: string, data: Record<string, unknown>): void {
  try {
    console.info(
      JSON.stringify({
        tag: TAG,
        level: "info",
        event,
        // Railway's log text search only matches `message`, so keep the tag in it.
        message: `${TAG} ${event}`,
        timestamp: new Date().toISOString(),
        ...data,
      }),
    );
  } catch {
    /* diagnostics must never break a request */
  }
}
