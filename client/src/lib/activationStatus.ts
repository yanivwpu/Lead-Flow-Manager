/** Response shape for GET /api/activation-status (onboarding + inbox gating). */

export interface ActivationStatusPayload {
  whatsappConnected: boolean;
  instagramConnected: boolean;
  facebookConnected: boolean;
  metaConnected: boolean;
  hasAnyMessagingChannel: boolean;
  hasSentFirstMessage: boolean;
  checklistComplete: boolean;
}

export function activationSetupModalStorageKey(userId: string | undefined): string {
  return userId
    ? `activation-setup-modal-last-shown-day-${userId}`
    : "activation-setup-modal-last-shown-day";
}

export function todayLocalYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readActivationSetupModalLastShownDay(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeActivationSetupModalLastShownDay(key: string, day: string): void {
  try {
    localStorage.setItem(key, day);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Existing Get Started modal — no new route. Incomplete = no messaging channel connected. */
export function shouldShowActivationSetupModal(opts: {
  activationPending: boolean;
  activation: ActivationStatusPayload | null | undefined;
  dismissedThisSession: boolean;
  shownToday: boolean;
}): boolean {
  return (
    !opts.activationPending &&
    !!opts.activation &&
    !opts.activation.hasAnyMessagingChannel &&
    !opts.dismissedThisSession &&
    !opts.shownToday
  );
}

/**
 * Auto-open only on Inbox / conversation routes, where a messaging channel is required.
 * Prospect AI, Integrations, Templates, Settings, Growth Engine, etc. stay unblocked.
 */
export function isInboxActivationModalPath(pathname: string): boolean {
  const path = String(pathname || "").split("?")[0].split("#")[0];
  return path === "/app/inbox" || path.startsWith("/app/inbox/");
}

export function shouldAutoOpenActivationSetupModal(opts: {
  activationPending: boolean;
  activation: ActivationStatusPayload | null | undefined;
  dismissedThisSession: boolean;
  shownToday: boolean;
  pathname: string;
}): boolean {
  return isInboxActivationModalPath(opts.pathname) && shouldShowActivationSetupModal(opts);
}
