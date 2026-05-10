/** localStorage key — analytics choice + metadata */
export const COOKIE_CONSENT_STORAGE_KEY = "whachat_cookie_consent";

export const GA_MEASUREMENT_ID = "G-6Y1CWBVBHL";

export type ConsentBasis =
  | "explicit"
  | "implicit-non-eu"
  | "implicit-unknown-signed-in";

export type StoredCookieConsent = {
  v: 1;
  analytics: boolean;
  decidedAt: string;
  basis?: ConsentBasis;
};

/** EU member states + EEA (IS, LI, NO) + UK — ISO 3166-1 alpha-2 */
const EU_UK_EEA = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
]);

export function isEuUkEeaCountry(code: string | null | undefined): boolean {
  if (!code || code.length !== 2) return false;
  return EU_UK_EEA.has(code.toUpperCase());
}

export function readStoredConsent(): StoredCookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCookieConsent;
    if (parsed?.v !== 1 || typeof parsed.analytics !== "boolean") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredConsent(c: StoredCookieConsent): void {
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(c));
}

let gaInjected = false;

/** Loads gtag once after analytics consent. Safe to call multiple times. */
export function loadGoogleAnalytics(measurementId: string = GA_MEASUREMENT_ID): void {
  if (typeof window === "undefined" || gaInjected) return;
  gaInjected = true;

  const w = window as Window & {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };
  w.dataLayer = w.dataLayer || [];
  function gtag(...args: unknown[]) {
    w.dataLayer!.push(args);
  }
  w.gtag = gtag;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(s);
  s.onload = () => {
    gtag("js", new Date());
    gtag("config", measurementId);
  };
}
