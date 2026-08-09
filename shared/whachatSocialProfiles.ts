/**
 * Verified WhachatCRM public social profiles.
 * Single source for footer, Organization sameAs, and tests.
 * Platform-neutral (no React icon components) so server and client can both import.
 */

export const WHACHAT_SOCIAL_PLATFORM_IDS = [
  "facebook",
  "linkedin",
  "x",
  "instagram",
] as const;

export type WhachatSocialPlatformId = (typeof WHACHAT_SOCIAL_PLATFORM_IDS)[number];

export type WhachatSocialProfile = {
  id: WhachatSocialPlatformId;
  /** Human-readable platform name (never translated). */
  platformName: string;
  /** Verified HTTPS profile URL — do not alter. */
  url: string;
};

/** Exact official WhachatCRM profiles only. No YouTube until verified. */
export const WHACHAT_SOCIAL_PROFILES: readonly WhachatSocialProfile[] = [
  {
    id: "facebook",
    platformName: "Facebook",
    url: "https://www.facebook.com/whachatcrm/",
  },
  {
    id: "linkedin",
    platformName: "LinkedIn",
    url: "https://www.linkedin.com/company/whachatcrm",
  },
  {
    id: "x",
    platformName: "X",
    url: "https://x.com/whachatcrm",
  },
  {
    id: "instagram",
    platformName: "Instagram",
    url: "https://www.instagram.com/whachatcrm/",
  },
] as const;

/** Organization JSON-LD `sameAs` — same verified URLs, no duplicates. */
export const WHACHAT_ORGANIZATION_SAME_AS: readonly string[] = WHACHAT_SOCIAL_PROFILES.map(
  (p) => p.url,
);

export const WHACHAT_SOCIAL_LINK_REL = "noopener noreferrer me" as const;

export function socialAriaLabel(
  platformName: string,
  template: string,
): string {
  return template.replace(/\{\{\s*platform\s*\}\}/g, platformName);
}
