/**
 * Prospect AI first-time onboarding persistence + analytics helpers.
 * Completion is per-user and never auto-shows again after finish/skip.
 */

import { hasAnalyticsConsent } from "@/lib/cookieConsent";

const STORAGE_PREFIX = "prospect-ai-onboarding-complete";

export function prospectAiOnboardingStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function isProspectAiOnboardingComplete(userId: string | null | undefined): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    return localStorage.getItem(prospectAiOnboardingStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markProspectAiOnboardingComplete(userId: string | null | undefined): void {
  if (!userId || typeof window === "undefined") return;
  try {
    localStorage.setItem(prospectAiOnboardingStorageKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export type ProspectAiGuideAnalyticsEvent =
  | "prospect_ai_guide_viewed"
  | "prospect_ai_guide_skipped"
  | "prospect_ai_guide_completed"
  | "prospect_ai_guide_reopened"
  | "prospect_ai_discover_dialog_auto_opened"
  | "prospect_ai_first_discovery_started";

type GtagFn = (...args: unknown[]) => void;

function getGtag(): GtagFn | null {
  if (typeof window === "undefined") return null;
  const gtag = (window as Window & { gtag?: GtagFn }).gtag;
  return typeof gtag === "function" ? gtag : null;
}

/** Non-deduped engagement events for the Prospect AI guide. */
export function trackProspectAiGuideEvent(
  eventName: ProspectAiGuideAnalyticsEvent,
  params: Record<string, unknown> = {},
): void {
  if (!hasAnalyticsConsent()) return;
  const gtag = getGtag();
  if (!gtag) return;
  try {
    gtag("event", eventName, params);
  } catch {
    /* fail silently */
  }
}

/** Scroll to Discover form and focus Business Type (first required field). */
export function focusProspectAiDiscoverForm(): boolean {
  if (typeof document === "undefined") return false;
  const input = document.getElementById("pai-business-type") as HTMLInputElement | null;
  const panel = document.querySelector('[data-testid="prospect-discover-tab"]');
  panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!input) return false;
  input.focus({ preventScroll: true });
  input.classList.add("ring-2", "ring-cyan-400", "ring-offset-2");
  window.setTimeout(() => {
    input.classList.remove("ring-2", "ring-cyan-400", "ring-offset-2");
  }, 2400);
  return true;
}
