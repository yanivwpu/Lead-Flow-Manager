/**
 * Deterministic mail-merge for Prospect AI templates.
 * Only replaces variables the user placed; never invents new tokens or AI copy.
 */

const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.-]*)\s*\}\}/g;

export const PROSPECT_MESSAGE_VARIABLES = [
  "first_name",
  "last_name",
  "full_name",
  "business_name",
  "city",
  "category",
  "website",
  "phone",
  "email",
] as const;

export type ProspectMessageVariableKey = (typeof PROSPECT_MESSAGE_VARIABLES)[number];

export const PROSPECT_MESSAGE_VARIABLE_LABELS: Record<ProspectMessageVariableKey, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  full_name: "Full Name",
  business_name: "Business Name",
  city: "City",
  category: "Category",
  website: "Website",
  phone: "Phone",
  email: "Email",
};

/** UI grouping for the Insert Variable picker (order within each group is display order). */
export const PROSPECT_MESSAGE_VARIABLE_GROUPS: ReadonlyArray<{
  id: string;
  label: string;
  keys: readonly ProspectMessageVariableKey[];
}> = [
  {
    id: "prospect",
    label: "Prospect",
    keys: ["first_name", "last_name", "business_name", "category", "city"],
  },
  {
    id: "contact",
    label: "Contact",
    keys: ["website", "email", "phone"],
  },
];

export type ProspectMessageVariableSource = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  companyName?: string | null;
  businessType?: string | null;
  industry?: string | null;
  category?: string | null;
};

function splitDisplayName(displayName: string): { first: string; last: string } {
  const t = (displayName || "").trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0]!, last: "" };
  return { first: parts[0]!, last: parts.slice(1).join(" ") };
}

/** Build lowercase key → value map from contact + prospect intelligence fields. */
export function buildProspectMessageVariableMap(
  source: ProspectMessageVariableSource,
): Record<string, string> {
  const full = String(source.name || "").trim();
  const { first, last } = splitDisplayName(full);
  const business =
    String(source.companyName || "").trim() || full;
  const category =
    String(source.category || "").trim() ||
    String(source.businessType || "").trim() ||
    String(source.industry || "").trim();

  const map: Record<string, string> = {
    first_name: first,
    last_name: last,
    full_name: full,
    business_name: business,
    city: String(source.city || "").trim(),
    category,
    website: String(source.website || "").trim(),
    phone: String(source.phone || "").trim(),
    email: String(source.email || "").trim(),
  };
  return map;
}

export function isSupportedProspectMessageVariable(key: string): boolean {
  const k = String(key || "")
    .trim()
    .toLowerCase();
  return (PROSPECT_MESSAGE_VARIABLES as readonly string[]).includes(k);
}

/**
 * Replace supported {{variables}} with values from the map.
 * - Missing values → empty string (traditional mail merge)
 * - Unsupported / ai_* / unknown tokens → left unchanged (never invent)
 */
export function mergeProspectTemplate(
  template: string,
  values: Record<string, string>,
  opts?: { replaceMissingWithEmpty?: boolean },
): string {
  if (!template) return "";
  const replaceMissing = opts?.replaceMissingWithEmpty !== false;
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(values || {})) {
    normalized[String(k).trim().toLowerCase()] = String(v ?? "");
  }

  return template.replace(TOKEN_RE, (full, name: string) => {
    const key = String(name || "")
      .trim()
      .toLowerCase();
    if (!key) return full;
    // AI placeholders are handled by a separate layer — never merge here.
    if (key.startsWith("ai_")) return full;
    if (!isSupportedProspectMessageVariable(key)) return full;
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      return normalized[key] ?? "";
    }
    return replaceMissing ? "" : full;
  });
}

export function extractProspectTemplateTokens(
  subject?: string | null,
  body?: string | null,
): string[] {
  const blob = `${subject || ""}\n${body || ""}`;
  const found = new Set<string>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(blob)) !== null) {
    const name = (m[1] || "").trim().toLowerCase();
    if (name) found.add(name);
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

/** Sample prospect for UI preview when no contact is selected. */
export function buildSampleProspectMessageVariableSource(): ProspectMessageVariableSource {
  return {
    name: "Alex Rivera",
    email: "alex@example.com",
    phone: "+15551234567",
    website: "https://riverarealty.example",
    city: "Pompano Beach",
    companyName: "Rivera Realty",
    businessType: "real_estate",
    industry: "Real Estate",
    category: "Real Estate",
  };
}
