/**
 * Facebook Messenger contact display-name helpers.
 *
 * Provenance is stored on contact.sourceDetails.facebookDisplayNameSource:
 * - psid: temporary numeric fallback (exact sender PSID or PSID-shaped id)
 * - meta: resolved from Graph using the receiving Page token
 * - manual: set/changed by the workspace user via contact edit API
 * - unknown: legacy non-PSID name with no provenance (protected; not assumed manual)
 */

export type FacebookDisplayNameSource = "psid" | "meta" | "manual" | "unknown";

export const FACEBOOK_DISPLAY_NAME_SOURCE_KEY = "facebookDisplayNameSource";

/** Meta PSIDs are long (typically 15–17 digits). Short numeric labels are legitimate names. */
const PSID_SHAPED_RE = /^\d{15,}$/;

export function isFacebookPsidShapedId(value: string | null | undefined): boolean {
  return !!value && PSID_SHAPED_RE.test(value.trim());
}

/** @deprecated Prefer isFacebookPsidShapedId — kept for test clarity aliases. */
export function isRawNumericId(value: string | null | undefined): boolean {
  return isFacebookPsidShapedId(value);
}

export function readFacebookDisplayNameSource(
  sourceDetails: unknown,
): FacebookDisplayNameSource | null {
  if (!sourceDetails || typeof sourceDetails !== "object") return null;
  const raw = (sourceDetails as Record<string, unknown>)[FACEBOOK_DISPLAY_NAME_SOURCE_KEY];
  if (raw === "psid" || raw === "meta" || raw === "manual" || raw === "unknown") return raw;
  return null;
}

/**
 * Resolve provenance for an existing contact name.
 * Does not assume every non-PSID name is user-edited.
 */
export function resolveFacebookDisplayNameSource(args: {
  name: string | null | undefined;
  senderPsid: string;
  sourceDetails?: unknown;
}): FacebookDisplayNameSource {
  const stored = readFacebookDisplayNameSource(args.sourceDetails);
  if (stored) return stored;

  const current = (args.name || "").trim();
  if (!current) return "psid";
  if (current === args.senderPsid) return "psid";
  if (isFacebookPsidShapedId(current)) return "psid";
  // Legacy real-looking name without provenance — protect, but do not label as manual.
  return "unknown";
}

export function isFacebookNamePlaceholder(
  name: string | null | undefined,
  senderPsid: string,
): boolean {
  const source = resolveFacebookDisplayNameSource({ name, senderPsid });
  return source === "psid";
}

/** Prefer Graph `name`, else first + last. */
export function composeFacebookDisplayName(profile: {
  name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
}): string | null {
  const full =
    typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : null;
  if (full) return full;
  const first =
    typeof profile.first_name === "string" && profile.first_name.trim()
      ? profile.first_name.trim()
      : "";
  const last =
    typeof profile.last_name === "string" && profile.last_name.trim()
      ? profile.last_name.trim()
      : "";
  const joined = `${first} ${last}`.trim();
  return joined || null;
}

/** Lookup only while the contact still has a PSID / empty fallback. */
export function shouldLookupFacebookSenderProfile(args: {
  name: string | null | undefined;
  senderPsid: string;
  sourceDetails?: unknown;
}): boolean {
  return resolveFacebookDisplayNameSource(args) === "psid";
}

/**
 * Whether Meta may replace the current name.
 * - psid: yes
 * - meta / manual / unknown: no (unknown protected without assuming user edit)
 */
export function canFacebookMetaOverwriteName(args: {
  name: string | null | undefined;
  senderPsid: string;
  sourceDetails?: unknown;
}): boolean {
  return resolveFacebookDisplayNameSource(args) === "psid";
}

export function buildFacebookContactNamePatch(
  currentName: string | null | undefined,
  senderPsid: string,
  resolvedDisplayName: string | null | undefined,
  sourceDetails?: unknown,
): { name: string; sourceDetails: Record<string, unknown> } | null {
  const resolved = (resolvedDisplayName || "").trim();
  if (!resolved) return null;
  if (resolved === senderPsid || isFacebookPsidShapedId(resolved)) return null;
  if (!canFacebookMetaOverwriteName({ name: currentName, senderPsid, sourceDetails })) {
    return null;
  }
  if ((currentName || "").trim() === resolved) {
    // Same display text, but stamp meta provenance if still psid-shaped storage.
    return {
      name: resolved,
      sourceDetails: mergeFacebookDisplayNameSource(sourceDetails, "meta"),
    };
  }
  return {
    name: resolved,
    sourceDetails: mergeFacebookDisplayNameSource(sourceDetails, "meta"),
  };
}

export function mergeFacebookDisplayNameSource(
  sourceDetails: unknown,
  source: FacebookDisplayNameSource,
): Record<string, unknown> {
  const base =
    sourceDetails && typeof sourceDetails === "object" && !Array.isArray(sourceDetails)
      ? { ...(sourceDetails as Record<string, unknown>) }
      : {};
  base[FACEBOOK_DISPLAY_NAME_SOURCE_KEY] = source;
  return base;
}

/** Persist name used at create time when Graph has not returned yet. */
export function facebookCreateNameAndSource(
  senderPsid: string,
  preferredName?: string | null,
): { name: string; source: FacebookDisplayNameSource } {
  const preferred = (preferredName || "").trim();
  if (preferred && preferred !== senderPsid && !isFacebookPsidShapedId(preferred)) {
    return { name: preferred, source: "unknown" };
  }
  return { name: senderPsid, source: "psid" };
}
