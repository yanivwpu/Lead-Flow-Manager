/**
 * Resolve which metaConnectionType to persist.
 * Sticky: coexistence must not silently demote to embedded/manual on reconnect/refresh
 * unless an explicit architecture-changing onboarding allows it.
 */
export function resolvePersistedMetaConnectionType(params: {
  previousType: string | null | undefined;
  requestedType: string | null | undefined;
  /** True only for authoritative Embedded Signup / Coexistence OAuth completion. */
  allowArchitectureChange?: boolean;
}): string {
  const previous = String(params.previousType || "").trim() || null;
  const requested = String(params.requestedType || "").trim() || "manual_legacy";

  if (
    previous === "coexistence" &&
    requested !== "coexistence" &&
    !params.allowArchitectureChange
  ) {
    return "coexistence";
  }

  return requested;
}
