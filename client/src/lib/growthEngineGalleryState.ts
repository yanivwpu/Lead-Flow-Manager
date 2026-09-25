import type { RgeEntitlementStatus } from "@shared/rgePaths";

export type GrowthEngineGalleryAction =
  | "coming_soon"
  | "loading"
  | "install"
  | "upgrade"
  | "continue_setup"
  | "manage"
  | "restore";

export type GrowthEngineGalleryState = {
  action: GrowthEngineGalleryAction;
  label: string;
  statusLabel: string;
  disabled: boolean;
  note?: string;
};

/**
 * Maps only server-backed entitlement fields to gallery actions. Catalog metadata
 * must never be used to infer whether an engine is installed or ready.
 */
export function resolveRgeGalleryState(input: {
  catalogStatus: "available" | "coming_soon";
  entitlementStatus?: RgeEntitlementStatus | null;
  onboardingSubmittedAt?: string | null;
  accessOk?: boolean;
  hasPro?: boolean;
  loading?: boolean;
  error?: boolean;
}): GrowthEngineGalleryState {
  if (input.catalogStatus === "coming_soon") {
    return { action: "coming_soon", label: "Coming soon", statusLabel: "Coming soon", disabled: true };
  }
  if (input.loading) {
    return { action: "loading", label: "Checking access…", statusLabel: "Checking access", disabled: true };
  }

  const installed = input.entitlementStatus === "installed";
  const setupStarted = input.entitlementStatus === "purchased" || input.entitlementStatus === "submitted";
  const savedConfiguration = installed || setupStarted;

  if (input.accessOk === false && savedConfiguration) {
    return {
      action: "restore",
      label: "Restore Pro to resume",
      statusLabel: "Paused",
      disabled: false,
      note: "Your configuration is saved.",
    };
  }
  if (installed) {
    return { action: "manage", label: "Manage Growth Engine", statusLabel: "Installed", disabled: false };
  }
  if (setupStarted && !input.onboardingSubmittedAt) {
    return { action: "continue_setup", label: "Continue setup", statusLabel: "Setup incomplete", disabled: false };
  }
  if (setupStarted) {
    return { action: "continue_setup", label: "Continue setup", statusLabel: "Launch in progress", disabled: false };
  }
  if (input.error) {
    return {
      action: "upgrade",
      label: "View details",
      statusLabel: "Access unavailable",
      disabled: false,
      note: "We couldn't verify access. Open details to try again.",
    };
  }
  if (input.accessOk === true || input.hasPro === true) {
    return { action: "install", label: "Install Growth Engine", statusLabel: "Available", disabled: false };
  }
  return { action: "upgrade", label: "Upgrade to Pro", statusLabel: "Pro required", disabled: false };
}
