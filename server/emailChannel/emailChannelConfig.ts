import {
  resolveEmailChannelCaps,
  type EmailChannelCaps,
} from "@shared/emailChannel";

/**
 * Server-only: read Email soft-cap ENV overrides.
 * Shared/client code must never call this or touch process.env for these values.
 */
export function getEmailChannelCaps(): EmailChannelCaps {
  return resolveEmailChannelCaps(process.env as Record<string, string | undefined>);
}
