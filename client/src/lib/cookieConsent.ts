/** localStorage key — analytics choice + metadata */
export const COOKIE_CONSENT_STORAGE_KEY = "whachat_cookie_consent";

/** Override via VITE_GA_MEASUREMENT_ID at build time if the GA4 property ID changes. */
export const GA_MEASUREMENT_ID =
  (typeof import.meta.env.VITE_GA_MEASUREMENT_ID === "string" &&
    import.meta.env.VITE_GA_MEASUREMENT_ID.trim()) ||
  "G-6Y1CWBVBHL";

export type ConsentBasis =
  | "explicit"
  | "implicit-non-eu"
  | "implicit-unknown-region"
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

const EU_UK_EEA_REGIONS = [...EU_UK_EEA];

const GA_CONSENT_ALL_DENIED = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

const GA_CONSENT_ANALYTICS_GRANTED = {
  analytics_storage: "granted",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

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
  const prev = readStoredConsent();
  localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(c));
  if (c.analytics && prev?.analytics !== true) {
    if (gaInjected) {
      applyAnalyticsConsentUpdate();
    }
    notifyAnalyticsConsentGranted();
  }
}

export function hasAnalyticsConsent(): boolean {
  return readStoredConsent()?.analytics === true;
}

let gaInjected = false;
let gaReady = false;
let activeMeasurementId: string | null = null;
const gaReadyListeners = new Set<() => void>();
const consentGrantedListeners = new Set<() => void>();

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

function gtagWindow(): GtagWindow {
  return window as GtagWindow;
}

function ensureGoogleGtagSnippet(): (...args: unknown[]) => void {
  const w = gtagWindow();
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag === "function") {
    return w.gtag;
  }
  const gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  w.gtag = gtag;
  return gtag;
}

function callGtag(...args: unknown[]): void {
  ensureGoogleGtagSnippet()(...args);
}

function queueGtagConsentBootstrap(): void {
  callGtag("consent", "default", {
    ...GA_CONSENT_ALL_DENIED,
    region: EU_UK_EEA_REGIONS,
  });
  callGtag("consent", "default", GA_CONSENT_ALL_DENIED);
  callGtag("consent", "update", GA_CONSENT_ANALYTICS_GRANTED);
}

function applyAnalyticsConsentUpdate(): void {
  callGtag("consent", "update", GA_CONSENT_ANALYTICS_GRANTED);
}

export function isGoogleAnalyticsReady(): boolean {
  return gaReady;
}

export function getActiveGaMeasurementId(): string | null {
  return activeMeasurementId;
}

/** Subscribe when gtag script has finished loading. Returns unsubscribe. */
export function onGoogleAnalyticsReady(listener: () => void): () => void {
  if (gaReady) {
    listener();
    return () => {};
  }
  gaReadyListeners.add(listener);
  return () => gaReadyListeners.delete(listener);
}

function notifyGoogleAnalyticsReady(measurementId: string): void {
  gaReady = true;
  activeMeasurementId = measurementId;
  for (const listener of gaReadyListeners) {
    listener();
  }
}

/** Fires when analytics consent is stored as granted (explicit or implicit). */
export function onAnalyticsConsentGranted(listener: () => void): () => void {
  if (hasAnalyticsConsent()) {
    listener();
    return () => {};
  }
  consentGrantedListeners.add(listener);
  return () => consentGrantedListeners.delete(listener);
}

function notifyAnalyticsConsentGranted(): void {
  for (const listener of consentGrantedListeners) {
    listener();
  }
}

export function getAnalyticsPagePath(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

function pushPageViewEvent(pagePath: string): void {
  callGtag("event", "page_view", {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** Fire a GA4 page_view (only when consent granted and gtag ready). */
export function trackGoogleAnalyticsPageView(pagePath: string = getAnalyticsPagePath()): void {
  if (!gaReady || !hasAnalyticsConsent()) return;
  pushPageViewEvent(pagePath);
}

/** Loads gtag once after analytics consent. Safe to call multiple times. */
export function loadGoogleAnalytics(measurementId: string = GA_MEASUREMENT_ID): void {
  if (typeof window === "undefined" || gaInjected || !hasAnalyticsConsent()) {
    return;
  }

  gaInjected = true;
  activeMeasurementId = measurementId;

  ensureGoogleGtagSnippet();
  queueGtagConsentBootstrap();
  callGtag("js", new Date());
  callGtag("config", measurementId, { send_page_view: false });

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);

  s.onerror = () => {
    gaInjected = false;
    activeMeasurementId = null;
  };

  s.onload = () => {
    applyAnalyticsConsentUpdate();
    notifyGoogleAnalyticsReady(measurementId);
    pushPageViewEvent(getAnalyticsPagePath());
  };
}
