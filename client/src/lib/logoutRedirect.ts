/**
 * Send successful production-app sign-outs back to the public website.
 * Preview, staging and local origins remain on their own origin.
 */
export function resolveLogoutLandingUrl(currentOrigin: string): string | null {
  return currentOrigin === "https://app.whachatcrm.com"
    ? "https://www.whachatcrm.com/"
    : null;
}
