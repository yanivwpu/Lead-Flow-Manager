import { z } from "zod";

export type AgentPageSocialUrls = {
  websiteUrl: string;
  facebookUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
  youtubeUrl: string;
};

const profileLinkUrlField = z
  .string()
  .max(500)
  .refine((v) => !v || /^https?:\/\//i.test(v.trim()), {
    message: "URL must start with http:// or https://",
  })
  .optional()
  .nullable()
  .or(z.literal(""));

export const agentPageSocialUrlsPatchSchema = z.object({
  publicWebsite: profileLinkUrlField,
  facebookUrl: profileLinkUrlField,
  instagramUrl: profileLinkUrlField,
  linkedinUrl: profileLinkUrlField,
  youtubeUrl: profileLinkUrlField,
});

export type AgentPageSocialUrlsPatch = z.infer<typeof agentPageSocialUrlsPatchSchema>;

export function normalizeAgentPageSocialUrl(value: string | null | undefined): string {
  return (value || "").trim();
}

export function resolveAgentPageSocialUrls(row: {
  publicWebsite?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
}): AgentPageSocialUrls {
  return {
    websiteUrl: normalizeAgentPageSocialUrl(row.publicWebsite),
    facebookUrl: normalizeAgentPageSocialUrl(row.facebookUrl),
    instagramUrl: normalizeAgentPageSocialUrl(row.instagramUrl),
    linkedinUrl: normalizeAgentPageSocialUrl(row.linkedinUrl),
    youtubeUrl: normalizeAgentPageSocialUrl(row.youtubeUrl),
  };
}

export function hasAgentPageSocialLinks(urls: AgentPageSocialUrls): boolean {
  return Boolean(
    urls.websiteUrl ||
      urls.facebookUrl ||
      urls.instagramUrl ||
      urls.linkedinUrl ||
      urls.youtubeUrl,
  );
}
