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
