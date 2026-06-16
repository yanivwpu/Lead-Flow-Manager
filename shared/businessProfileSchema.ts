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
