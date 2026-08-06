/**
 * AI Assisted Template — only placeholders whose names start with `ai_` are AI-generated.
 * Everything else in the template must stay exactly as written.
 */

const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}/g;

export function isAiPlaceholderKey(key: string): boolean {
  return String(key || "")
    .trim()
    .toLowerCase()
    .startsWith("ai_");
}

/** Ordered unique ai_* keys found in subject/body. */
export function extractAiPlaceholderKeys(
  subject?: string | null,
  body?: string | null,
): string[] {
  const blob = `${subject || ""}\n${body || ""}`;
  const found: string[] = [];
  const seen = new Set<string>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(blob)) !== null) {
    const name = (m[1] || "").trim();
    if (!name || !isAiPlaceholderKey(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(key);
  }
  return found;
}

/** Common AI slots offered in the picker (users may still type custom ai_* keys). */
export const PROSPECT_AI_PLACEHOLDER_PRESETS = [
  { key: "ai_opening", label: "Personalized Opening" },
  { key: "ai_reason", label: "Why This Business" },
  { key: "ai_cta", label: "Call to Action" },
  { key: "ai_closing", label: "Closing" },
] as const;

/**
 * Replace only {{ai_*}} tokens present in `replacements`.
 * Leaves unknown ai_* tokens and all non-ai tokens untouched.
 * Never invents keys that were not in the template.
 */
export function applyAiPlaceholderReplacements(
  template: string,
  replacements: Record<string, string>,
): string {
  if (!template) return "";
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(replacements || {})) {
    const key = String(k || "")
      .trim()
      .toLowerCase();
    if (!isAiPlaceholderKey(key)) continue;
    map.set(key, String(v ?? "").trim());
  }
  return template.replace(TOKEN_RE, (full, name: string) => {
    const key = String(name || "")
      .trim()
      .toLowerCase();
    if (!isAiPlaceholderKey(key)) return full;
    if (!map.has(key)) return full;
    return map.get(key) ?? "";
  });
}

/**
 * Validate an AI fill response: only allow keys that were requested and start with ai_.
 * Drops everything else (prevents full-body rewrite smuggling).
 */
export function sanitizeAiPlaceholderFillResponse(
  requestedKeys: string[],
  raw: unknown,
): Record<string, string> {
  const allowed = new Set(
    requestedKeys.map((k) =>
      String(k || "")
        .trim()
        .toLowerCase(),
    ),
  );
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k || "")
      .trim()
      .toLowerCase();
    if (!allowed.has(key) || !isAiPlaceholderKey(key)) continue;
    if (typeof v !== "string" && typeof v !== "number") continue;
    out[key] = String(v).trim().slice(0, 2000);
  }
  return out;
}

export function buildAiPlaceholderFillSystemPrompt(): string {
  return `You fill ONLY the listed AI placeholders for a cold-outreach template.

Rules:
- Return JSON only: an object whose keys are exactly the requested placeholder names.
- Values are short plain-text fragments (not a full email).
- Do NOT rewrite, improve, or return the rest of the template.
- Do NOT invent facts, awards, listings, or interest the prospect did not show.
- Do NOT add URLs unless a verified campaign link is provided in the user message.
- Do NOT include markdown fences.
- Stay in the requested language when specified.`;
}

export function buildAiPlaceholderFillUserPrompt(input: {
  keys: string[];
  prospectName?: string | null;
  companyName?: string | null;
  industry?: string | null;
  businessType?: string | null;
  city?: string | null;
  outreachAngle?: string | null;
  reasoningSummary?: string | null;
  campaignEmphasis?: string | null;
  languageHint?: string | null;
  linkUrl?: string | null;
  workspaceBlock?: string | null;
}): string {
  const keys = input.keys.filter((k) => isAiPlaceholderKey(k));
  return `Fill these AI placeholders only:
${keys.map((k) => `- {{${k}}}`).join("\n")}

Prospect:
- Name: ${String(input.prospectName || "").trim() || "Unknown"}
- Business: ${String(input.companyName || "").trim() || "Unknown"}
- Industry: ${String(input.industry || "").trim() || "Unknown"}
- Category/type: ${String(input.businessType || "").trim() || "Unknown"}
- City: ${String(input.city || "").trim() || "Unknown"}
- Outreach angle: ${String(input.outreachAngle || "").trim() || "n/a"}
- Reasoning: ${String(input.reasoningSummary || "").trim() || "n/a"}

${input.workspaceBlock ? `${input.workspaceBlock}\n` : ""}
Campaign emphasis (optional guidance for the AI slots only):
${String(input.campaignEmphasis || "").trim() || "(none)"}

Language: ${String(input.languageHint || "auto").trim()}
${input.linkUrl ? `Verified campaign link (use only if an ai_* slot should mention it): ${input.linkUrl}` : "No campaign link."}

Return JSON object with exactly those keys.`;
}
