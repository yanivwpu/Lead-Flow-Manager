/**
 * Phase 1 public marketing locales — shared by client and (future) SSR.
 * English remains the authoritative base; es/he overlays supply visible copy.
 */

export const MARKETING_LOCALES = ["en", "es", "he"] as const;
export type MarketingLocale = (typeof MARKETING_LOCALES)[number];

export function normalizeMarketingLocale(lang?: string | null): MarketingLocale {
  const base = (lang || "en").split("-")[0]?.toLowerCase();
  if (base === "es" || base === "he") return base;
  return "en";
}

export function marketingDir(locale: MarketingLocale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}

/** Deep-merge plain objects/arrays.
 * - Arrays of plain objects → merge element-by-element by index (keeps base-only
 *   asset fields like image.src / screenshotKey when overlays only translate alt).
 * - Arrays of primitives (paragraphs, bullets) → overlay replaces when provided.
 */
export function mergeMarketingContent<T>(base: T, overlay: unknown): T {
  if (overlay === undefined || overlay === null) return base;
  if (Array.isArray(base)) {
    if (!Array.isArray(overlay)) return base;
    const baseIsObjectArray =
      base.length > 0 &&
      typeof base[0] === "object" &&
      base[0] !== null &&
      !Array.isArray(base[0]);
    const overlayIsObjectArray =
      overlay.length > 0 &&
      typeof overlay[0] === "object" &&
      overlay[0] !== null &&
      !Array.isArray(overlay[0]);
    if (baseIsObjectArray && overlayIsObjectArray) {
      const len = Math.max(base.length, overlay.length);
      const out: unknown[] = [];
      for (let i = 0; i < len; i++) {
        if (i >= overlay.length) out.push(base[i]);
        else if (i >= base.length) out.push(overlay[i]);
        else out.push(mergeMarketingContent(base[i], overlay[i]));
      }
      return out as T;
    }
    return overlay as T;
  }
  if (typeof base === "object" && base !== null) {
    if (typeof overlay !== "object" || overlay === null || Array.isArray(overlay)) {
      return base;
    }
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
      if (value === undefined) continue;
      out[key] = mergeMarketingContent((base as Record<string, unknown>)[key], value);
    }
    return out as T;
  }
  return overlay as T;
}
