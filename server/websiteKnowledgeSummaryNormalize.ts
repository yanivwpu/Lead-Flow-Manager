/**
 * OpenAI JSON mode may return `summary` as a string, nested object, or array.
 * Coerce to a single plain-text string for CRM storage and UI (never "[object Object]").
 */

const OBJECT_TEXT_KEYS = [
  "summary",
  "text",
  "content",
  "body",
  "message",
  "value",
  "output",
  "result",
  "description",
  "markdown",
] as const;

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function isScalar(v: unknown): boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * Last resort for models that answer with a nested JSON tree instead of prose.
 * Without this the known-key probes below bottom out and the caller keeps the raw
 * JSON envelope, which reads as an empty preview in the UI.
 */
function renderStructuredText(value: unknown, depth = 0): string {
  if (value == null) return "";
  if (isScalar(value)) return String(value).trim();

  const indent = "  ".repeat(depth);

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        // A row of scalars reads better inline: "Business Listing — $29/mo — Basic listing".
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const values = Object.values(item as Record<string, unknown>);
          if (values.length > 0 && values.every(isScalar)) {
            return `${indent}- ${values.map((v) => String(v).trim()).join(" — ")}`;
          }
        }
        const rendered = renderStructuredText(item, depth + 1);
        if (!rendered) return "";
        return rendered.includes("\n") ? `${indent}-\n${rendered}` : `${indent}- ${rendered}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => {
        const label = humanizeKey(k);
        if (isScalar(v)) {
          const scalar = String(v).trim();
          return scalar ? `${indent}${label}: ${scalar}` : "";
        }
        const rendered = renderStructuredText(v, depth + 1);
        return rendered ? `${indent}${label}:\n${rendered}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }

  return "";
}

/**
 * Keys carrying content the summary key did not cover.
 *
 * Only objects and arrays qualify. Scalar siblings on these envelopes are metadata
 * (`confidence`, `language`, `truncated`), and rendering them would put "Confidence: 0.9"
 * into a merchant's knowledge note.
 */
function structuredSiblings(
  o: Record<string, unknown>,
  usedKey: string,
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === usedKey || v == null) continue;
    if (typeof v !== "object") continue;
    if (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0) continue;
    rest[k] = v;
  }
  return rest;
}

export function extractWebsiteKnowledgeSummaryText(value: unknown): string {
  if (value == null) return "";

  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return "";
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        const parsed: unknown = JSON.parse(t);
        const inner = extractWebsiteKnowledgeSummaryText(parsed);
        if (inner) return inner;
      } catch {
        /* treat as literal text */
      }
    }
    return t;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => extractWebsiteKnowledgeSummaryText(item))
      .filter((s) => s.length > 0);
    if (parts.length > 0) return parts.join("\n\n").trim();
    return renderStructuredText(value);
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;

    for (const k of OBJECT_TEXT_KEYS) {
      if (k in o && o[k] != null) {
        const inner = extractWebsiteKnowledgeSummaryText(o[k]);
        if (!inner) continue;
        // The model is asked for `{ "summary": "..." }` but often volunteers extra
        // structured keys alongside a one-line summary. Returning the summary alone
        // silently threw those away — which is how a pricing table stopped reaching
        // the reply prompt. Keep the summary first, then everything it left out.
        const extra = renderStructuredText(structuredSiblings(o, k));
        return extra ? `${inner}\n${extra}` : inner;
      }
    }

    if ("data" in o && o.data != null) {
      const inner = extractWebsiteKnowledgeSummaryText(o.data);
      if (inner) return inner;
    }

    // OpenAI-style message parts (defensive)
    if (Array.isArray(o.parts)) {
      const inner = extractWebsiteKnowledgeSummaryText(o.parts);
      if (inner) return inner;
    }

    return renderStructuredText(o);
  }

  return "";
}

/** After structured extraction; avoids storing "[object Object]" from stray objects. */
export function finalizeWebsiteKnowledgeSummaryText(value: unknown): string {
  const extracted = extractWebsiteKnowledgeSummaryText(value).trim();
  if (extracted) return extracted;
  if (typeof value === "string") return value.trim();
  return "";
}
