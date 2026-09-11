import { z, type ZodError } from "zod";
import { companyLogoForPatch, isFirstPartyBusinessProfileLogoPath } from "./businessProfileLogo";

const optionalCompanyLogoField = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}, z.union([
  z.null(),
  z.string().max(500).refine(isFirstPartyBusinessProfileLogoPath, {
    message: "Upload a JPG, PNG, or WebP logo",
  }),
]).optional());

/** Empty / whitespace / explicit null all persist as SQL null. Omitted stays omitted. */
function emptyToNull(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  return value;
}

const optionalEmailField = z.preprocess(
  emptyToNull,
  z.string().email("Enter a valid email").max(200).nullable().optional(),
);

const optionalWebsiteField = z.preprocess((value) => {
  if (value === undefined) return undefined;
  const emptied = emptyToNull(value);
  if (emptied == null) return null;
  if (typeof emptied !== "string") return emptied;
  const trimmed = emptied.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}, z.string().url("Enter a valid website URL").max(500).nullable().optional());

export const businessProfilePatchSchema = z.object({
  displayName: z.string().max(120).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  companyLogo: optionalCompanyLogoField,
  publicPhone: z.string().max(40).optional().nullable(),
  publicEmail: optionalEmailField,
  publicWebsite: optionalWebsiteField,
  aboutText: z.string().max(2000).optional().nullable(),
  publishListingsPublicly: z.boolean().optional(),
});

export type BusinessProfilePatch = z.infer<typeof businessProfilePatchSchema>;

/** Persist empty/whitespace as SQL null so a cleared representative name is explicit. */
export function persistBusinessProfileDisplayName(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Representative name from stored Business Profile knowledge only.
 * userName / email / contactName are accepted so callers can prove they are ignored —
 * they must never refill a cleared field.
 */
export function hydrateBusinessProfileDisplayName(input: {
  knowledgeDisplayName?: string | null;
  userName?: string | null;
  email?: string | null;
  contactName?: string | null;
}): string {
  return persistBusinessProfileDisplayName(input.knowledgeDisplayName) ?? "";
}

/** Apply a PATCH to stored knowledge.displayName. Omitted key leaves the current value. */
export function applyBusinessProfileDisplayNamePatch(
  currentKnowledgeDisplayName: string | null | undefined,
  patch: { displayName?: string | null },
): string | null {
  if (!Object.prototype.hasOwnProperty.call(patch, "displayName")) {
    return persistBusinessProfileDisplayName(currentKnowledgeDisplayName);
  }
  return persistBusinessProfileDisplayName(patch.displayName);
}

/** Route helper: null/empty persist as null; missing key is undefined so the column is skipped. */
export function businessProfileDisplayNameFromPatch(
  patch: { displayName?: string | null },
): string | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(patch, "displayName")) return undefined;
  return persistBusinessProfileDisplayName(patch.displayName);
}

/** Persist empty/whitespace optional profile text as SQL null. */
export function persistOptionalProfileText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function pickBusinessProfilePatchField<K extends keyof BusinessProfilePatch>(
  patch: BusinessProfilePatch,
  key: K,
): BusinessProfilePatch[K] | undefined {
  return Object.prototype.hasOwnProperty.call(patch, key) ? patch[key] : undefined;
}

/**
 * Client save body — empty optional fields are explicit null so a first-time
 * workspace can create the knowledge row without dummy names or emails.
 */
export function buildBusinessProfileSaveBody(input: {
  displayName: string;
  businessName: string;
  publicPhone: string;
  publicEmail: string;
  publicWebsite: string;
  aboutText: string;
  companyLogo: string | null;
}): BusinessProfilePatch {
  const companyLogo = companyLogoForPatch(input.companyLogo);
  return {
    displayName: persistBusinessProfileDisplayName(input.displayName),
    businessName: persistOptionalProfileText(input.businessName),
    publicPhone: persistOptionalProfileText(input.publicPhone),
    publicEmail: persistOptionalProfileText(input.publicEmail),
    publicWebsite: persistOptionalProfileText(input.publicWebsite),
    aboutText: persistOptionalProfileText(input.aboutText),
    ...(companyLogo !== undefined ? { companyLogo } : {}),
  };
}

export function formatBusinessProfilePatchError(error: ZodError): {
  error: string;
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  const errorText =
    Object.entries(fieldErrors)
      .map(([field, message]) => `${field}: ${message}`)
      .join("; ") || "Invalid business profile";
  return { error: errorText, fieldErrors };
}

/** Turn a PATCH JSON error body into a toast-safe reason. Never returns a generic-only object. */
export function formatBusinessProfileSaveError(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (!payload || typeof payload !== "object") return "Failed to save business profile";
  const body = payload as { error?: unknown; fieldErrors?: unknown; message?: unknown };
  if (typeof body.error === "string" && body.error.trim()) return body.error.trim();
  const fieldSource =
    body.fieldErrors && typeof body.fieldErrors === "object"
      ? body.fieldErrors
      : body.error && typeof body.error === "object"
        ? body.error
        : null;
  if (fieldSource) {
    const parts = Object.entries(fieldSource as Record<string, unknown>)
      .map(([field, value]) => {
        const message = Array.isArray(value) ? value[0] : value;
        return typeof message === "string" && message.trim() ? `${field}: ${message}` : null;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts.join("; ");
  }
  if (typeof body.message === "string" && body.message.trim()) return body.message.trim();
  return "Failed to save business profile";
}

/** Drop identity keys so a request body cannot retarget another tenant's row. */
export function sanitizeAiBusinessKnowledgeUpdates<T extends Record<string, unknown>>(
  updates: T | null | undefined,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates ?? {})) {
    if (value === undefined) continue;
    if (key === "id" || key === "userId") continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

export type BusinessProfileResponse = {
  avatarUrl: string | null;
  displayName: string;
  businessName: string;
  companyLogo: string | null;
  publicPhone: string;
  publicEmail: string;
  publicWebsite: string;
  aboutText: string;
  calendlyConnected: boolean;
  calendlyEventTypeName: string;
  calendlySchedulingUrl: string;
  publishListingsPublicly: boolean;
};
