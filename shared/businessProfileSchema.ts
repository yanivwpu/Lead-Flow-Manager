import { z } from "zod";

const imageUrlField = z
  .string()
  .max(5_000_000)
  .refine(
    (v) =>
      !v ||
      v.startsWith("data:image/") ||
      v.startsWith("http") ||
      v.startsWith("/") ||
      v.includes("attached_assets"),
    { message: "Invalid image URL" },
  )
  .optional()
  .nullable();

export const businessProfilePatchSchema = z.object({
  displayName: z.string().max(120).optional().nullable(),
  businessName: z.string().max(200).optional().nullable(),
  companyLogo: imageUrlField,
  publicPhone: z.string().max(40).optional().nullable(),
  publicEmail: z.string().email().max(200).optional().nullable().or(z.literal("")),
  publicWebsite: z.string().url().max(500).optional().nullable().or(z.literal("")),
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
