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
    return parts.join("\n\n").trim();
  }

  if (typeof value === "object") {
    const o = value as Record<string, unknown>;

    for (const k of OBJECT_TEXT_KEYS) {
      if (k in o && o[k] != null) {
        const inner = extractWebsiteKnowledgeSummaryText(o[k]);
        if (inner) return inner;
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
