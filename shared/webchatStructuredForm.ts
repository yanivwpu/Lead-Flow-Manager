/**
 * Tenant-configured Web Chat forms. No HTML, JavaScript, or user-provided markup.
 */

export const WEBCHAT_FORM_FIELD_TYPES = [
  "name",
  "email",
  "phone",
  "select",
  "radio",
  "checkbox",
  "date",
  "consent",
] as const;

export type WebchatFormFieldType = (typeof WEBCHAT_FORM_FIELD_TYPES)[number];

export type WebchatFormField = {
  id: string;
  type: WebchatFormFieldType;
  label: string;
  required: boolean;
  options?: string[];
  consentText?: string;
  placeholder?: string;
};

export type WebchatFormDefinition = {
  id: string;
  title: string;
  description: string;
  submitLabel: string;
  fields: WebchatFormField[];
};

export const WEBCHAT_FORM_PUBLIC_SUBMITTED_CONTENT = "Form submitted";
export const WEBCHAT_FORM_MAX_FIELDS = 12;
export const WEBCHAT_FORM_MAX_OPTIONS = 12;
export const WEBCHAT_FORM_MAX_LABEL = 120;
export const WEBCHAT_FORM_MAX_TEXT = 500;

export const WEBCHAT_FORM_FIELD_ID_RE = /^[a-z][a-z0-9_]{0,39}$/;
const FIELD_ID_RE = WEBCHAT_FORM_FIELD_ID_RE;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s().-]{6,22}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTML_RE = /[<>]|javascript:|on\w+\s*=/i;

function cleanPlain(raw: unknown, max: number): string {
  if (typeof raw !== "string") return "";
  if (HTML_RE.test(raw)) return "";
  return raw.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function asType(raw: unknown): WebchatFormFieldType | null {
  return WEBCHAT_FORM_FIELD_TYPES.includes(raw as WebchatFormFieldType)
    ? (raw as WebchatFormFieldType)
    : null;
}

function sanitizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    const v = cleanPlain(item, 80);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= WEBCHAT_FORM_MAX_OPTIONS) break;
  }
  return out;
}

export function sanitizeWebchatFormField(raw: unknown): WebchatFormField | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const type = asType(o.type);
  if (!type) return null;
  const id = String(o.id || "").trim().toLowerCase();
  if (!FIELD_ID_RE.test(id)) return null;
  const label = cleanPlain(o.label, WEBCHAT_FORM_MAX_LABEL);
  if (!label) return null;
  const field: WebchatFormField = {
    id,
    type,
    label,
    required: o.required === true,
  };
  if (type === "select" || type === "radio" || type === "checkbox") {
    const options = sanitizeOptions(o.options);
    if (options.length < 1) return null;
    field.options = options;
  }
  if (type === "consent") {
    const consentText = cleanPlain(o.consentText, WEBCHAT_FORM_MAX_TEXT);
    if (!consentText) return null;
    field.consentText = consentText;
    field.required = true;
  }
  const placeholder = cleanPlain(o.placeholder, 80);
  if (placeholder && type !== "consent") field.placeholder = placeholder;
  return field;
}

export function sanitizeWebchatFormDefinition(raw: unknown): WebchatFormDefinition | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const id = String(o.id || "").trim().toLowerCase();
  if (!FIELD_ID_RE.test(id)) return null;
  const title = cleanPlain(o.title, WEBCHAT_FORM_MAX_LABEL);
  if (!title) return null;
  const fields: WebchatFormField[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(o.fields) ? o.fields : [];
  for (const item of list) {
    const field = sanitizeWebchatFormField(item);
    if (!field || seen.has(field.id)) continue;
    seen.add(field.id);
    fields.push(field);
    if (fields.length >= WEBCHAT_FORM_MAX_FIELDS) break;
  }
  if (fields.length === 0) return null;
  return {
    id,
    title,
    description: cleanPlain(o.description, WEBCHAT_FORM_MAX_TEXT),
    submitLabel: cleanPlain(o.submitLabel, 40) || "Submit",
    fields,
  };
}

export type WebchatFormValidation =
  | { ok: true; values: Record<string, string | string[] | boolean> }
  | { ok: false; error: string };

export function validateWebchatFormSubmission(
  form: WebchatFormDefinition,
  rawValues: unknown,
): WebchatFormValidation {
  const input = rawValues && typeof rawValues === "object" ? (rawValues as Record<string, unknown>) : {};
  const values: Record<string, string | string[] | boolean> = {};
  for (const field of form.fields) {
    const raw = input[field.id];
    if (field.type === "checkbox") {
      const selected = Array.isArray(raw)
        ? raw.map((x) => String(x).trim()).filter((x) => (field.options || []).includes(x))
        : [];
      if (field.required && selected.length === 0) {
        return { ok: false, error: `${field.label} is required.` };
      }
      values[field.id] = selected;
      continue;
    }
    if (field.type === "consent") {
      const accepted = raw === true || raw === "true" || raw === "yes" || raw === "on";
      if (field.required && !accepted) {
        return { ok: false, error: "Consent is required." };
      }
      values[field.id] = accepted;
      continue;
    }
    const text = typeof raw === "string" ? cleanPlain(raw, WEBCHAT_FORM_MAX_TEXT) : "";
    if (field.required && !text) {
      return { ok: false, error: `${field.label} is required.` };
    }
    if (!text) {
      values[field.id] = "";
      continue;
    }
    if (field.type === "email" && !EMAIL_RE.test(text)) {
      return { ok: false, error: "Enter a valid email address." };
    }
    if (field.type === "phone" && !PHONE_RE.test(text)) {
      return { ok: false, error: "Enter a valid phone number." };
    }
    if (field.type === "date" && !DATE_RE.test(text)) {
      return { ok: false, error: "Enter a valid date." };
    }
    if ((field.type === "select" || field.type === "radio") && !(field.options || []).includes(text)) {
      return { ok: false, error: `${field.label} is invalid.` };
    }
    if (field.type === "name" && text.length < 2) {
      return { ok: false, error: "Enter a valid name." };
    }
    values[field.id] = text;
  }
  return { ok: true, values };
}

export type WebchatFormInboxSubmission = {
  formId: string;
  title: string;
  submittedAt: string;
  fields: Array<{ id: string; type: WebchatFormFieldType; label: string; value: string | string[] | boolean }>;
  consent?: { accepted: boolean; text: string };
};

export function toInboxFormSubmission(
  form: WebchatFormDefinition,
  values: Record<string, string | string[] | boolean>,
  submittedAt = new Date().toISOString(),
): WebchatFormInboxSubmission {
  const fields = form.fields
    .filter((field) => field.type !== "consent")
    .map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      value: values[field.id] ?? "",
    }));
  const consentField = form.fields.find((f) => f.type === "consent");
  const consent =
    consentField && consentField.consentText
      ? {
          accepted: values[consentField.id] === true,
          text: consentField.consentText,
        }
      : undefined;
  return {
    formId: form.id,
    title: form.title,
    submittedAt,
    fields,
    ...(consent ? { consent } : {}),
  };
}

export function emptyWebchatFormDraft(): WebchatFormDefinition {
  return {
    id: "lead_capture",
    title: "Contact details",
    description: "",
    submitLabel: "Submit",
    fields: [],
  };
}

export function uniqueWebchatFormFieldId(
  type: string,
  existingIds: Iterable<string>,
): string {
  const raw = String(type || "field")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const base = /^[a-z]/.test(raw) ? raw.slice(0, 40) : "field";
  const taken = new Set(
    [...existingIds].map((id) => String(id || "").trim().toLowerCase()).filter(Boolean),
  );
  if (!taken.has(base) && FIELD_ID_RE.test(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const id = `${base}_${n}`.slice(0, 40);
    if (FIELD_ID_RE.test(id) && !taken.has(id)) return id;
  }
  return "field";
}

function draftFieldId(raw: unknown): string {
  return String((raw as { id?: unknown } | null)?.id || "")
    .trim()
    .toLowerCase();
}

export function webchatFormFieldDraftError(
  raw: unknown,
  otherIds: Iterable<string>,
): string | null {
  const sanitized = sanitizeWebchatFormField(raw);
  const id = draftFieldId(raw);
  if (!FIELD_ID_RE.test(id)) {
    return "Use a lowercase letter, then letters, numbers, or underscores.";
  }
  const taken = new Set(
    [...otherIds].map((x) => String(x || "").trim().toLowerCase()).filter(Boolean),
  );
  if (taken.has(id)) return "Field IDs must be unique.";
  if (sanitized) return null;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) return "Field is incomplete.";
  const type = asType(o.type);
  if (!type) return "Choose a supported field type.";
  if (!cleanPlain(o.label, WEBCHAT_FORM_MAX_LABEL)) return "Enter a label. HTML is not allowed.";
  if (type === "select" || type === "radio" || type === "checkbox") {
    if (sanitizeOptions(o.options).length < 1) return "Add at least one option.";
  }
  if (type === "consent" && !cleanPlain(o.consentText, WEBCHAT_FORM_MAX_TEXT)) {
    return "Consent text is required.";
  }
  return "This field is incomplete.";
}

export function chatbotFormDefinitionIsPublishable(raw: unknown): boolean {
  const form = sanitizeWebchatFormDefinition(raw);
  if (!form) return false;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const rawFields = Array.isArray(o?.fields) ? o!.fields : [];
  return rawFields.length > 0 && form.fields.length === rawFields.length;
}

export function chatbotFormNodesPublishError(nodes: unknown): string | null {
  if (!Array.isArray(nodes)) return null;
  for (const node of nodes) {
    const data =
      node && typeof node === "object"
        ? ((node as { data?: Record<string, unknown> }).data || {})
        : {};
    if (data.messageType !== "form") continue;
    const label = String(data.label || "Form");
    if (!chatbotFormDefinitionIsPublishable(data.webchatForm)) {
      return `"${label}" needs a valid Website Chat form with at least one complete field before this flow can be published.`;
    }
  }
  return null;
}

export function demoteActiveFlowIfFormIncomplete<T extends { isActive?: boolean | null; nodes?: unknown }>(
  flow: T,
): T {
  if (!flow.isActive) return flow;
  if (!chatbotFormNodesPublishError(flow.nodes)) return flow;
  return { ...flow, isActive: false };
}

export function identityFromFormValues(
  form: WebchatFormDefinition,
  values: Record<string, string | string[] | boolean>,
): { name?: string; email?: string; phone?: string } {
  const out: { name?: string; email?: string; phone?: string } = {};
  for (const field of form.fields) {
    const value = values[field.id];
    if (typeof value !== "string" || !value) continue;
    if (field.type === "name" && !out.name) out.name = value.trim();
    if (field.type === "email" && !out.email) {
      const email = value.trim().toLowerCase();
      if (email.includes("@")) out.email = email;
    }
    if (field.type === "phone" && !out.phone) {
      const digits = value.replace(/\D/g, "");
      const phone =
        digits.length === 11 && digits.startsWith("1")
          ? digits.slice(1)
          : digits.length >= 10
            ? digits
            : "";
      if (phone) out.phone = phone;
    }
  }
  return out;
}
