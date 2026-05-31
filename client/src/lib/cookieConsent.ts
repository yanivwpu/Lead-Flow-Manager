/** localStorage key — analytics choice + metadata */
export const COOKIE_CONSENT_STORAGE_KEY = "whachat_cookie_consent";

/** Override via VITE_GA_MEASUREMENT_ID at build time if the GA4 property ID changes. */
export const GA_MEASUREMENT_ID =
  (typeof import.meta.env.VITE_GA_MEASUREMENT_ID === "string" &&
    import.meta.env.VITE_GA_MEASUREMENT_ID.trim()) ||
  "G-6Y1CWVBVHL";

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
  console.info("[GA4] consent stored", {
    analytics: c.analytics,
    basis: c.basis ?? null,
    previousAnalytics: prev?.analytics ?? null,
  });
  if (c.analytics && prev?.analytics !== true) {
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
  const w = gtagWindow();
  console.info("[GA4] loaded", measurementId, {
    dataLayer: Array.isArray(w.dataLayer),
    gtagType: typeof w.gtag,
    consentAtLoad: hasAnalyticsConsent(),
  });
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

type PageViewSource = "initial" | "route";

function pushPageViewEvent(
  measurementId: string,
  pagePath: string,
  source: PageViewSource,
): boolean {
  const w = gtagWindow();
  if (typeof w.gtag !== "function") {
    console.warn("[GA4] page_view skipped — gtag is not a function", { pagePath, source });
    return false;
  }

  w.gtag("event", "page_view", {
    send_to: measurementId,
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  });

  if (source === "route") {
    console.info("[GA4] route page_view fired", pagePath);
  } else {
    console.info("[GA4] page_view fired", pagePath);
  }
  return true;
}

/** Fire a GA4 page_view (only when consent granted and gtag ready). */
export function trackGoogleAnalyticsPageView(
  pagePath: string = getAnalyticsPagePath(),
  source: PageViewSource = "initial",
): void {
  if (!gaReady) {
    console.info("[GA4] page_view skipped — gtag not ready", { pagePath, source });
    return;
  }
  if (!hasAnalyticsConsent()) {
    console.info("[GA4] page_view skipped — analytics consent false", { pagePath, source });
    return;
  }
  const measurementId = activeMeasurementId ?? GA_MEASUREMENT_ID;
  pushPageViewEvent(measurementId, pagePath, source);
}

/** Loads gtag once after analytics consent. Safe to call multiple times. */
export function loadGoogleAnalytics(measurementId: string = GA_MEASUREMENT_ID): void {
  if (typeof window === "undefined" || gaInjected) {
    if (gaInjected) {
      console.info("[GA4] load skipped — already injected", { measurementId });
    }
    return;
  }

  const consentGrantedAtLoad = hasAnalyticsConsent();
  console.info("[GA4] load requested", {
    measurementId,
    consentGranted: consentGrantedAtLoad,
    host: window.location.host,
  });
  if (!consentGrantedAtLoad) {
    console.info("[GA4] load blocked — no analytics consent in localStorage");
    return;
  }

  gaInjected = true;
  activeMeasurementId = measurementId;

  const w = gtagWindow();
  w.dataLayer = w.dataLayer || [];
  function gtagStub(...args: unknown[]) {
    w.dataLayer!.push(args);
  }
  w.gtag = w.gtag ?? gtagStub;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(s);

  s.onerror = () => {
    console.warn("[GA4] gtag script failed to load", measurementId);
    gaInjected = false;
    activeMeasurementId = null;
  };

  s.onload = () => {
    const gtagFn = gtagWindow().gtag ?? gtagStub;
    gtagFn("js", new Date());
    // send_page_view:true ensures at least one collect hit even if manual event dispatch fails.
    gtagFn("config", measurementId, { send_page_view: true });

    notifyGoogleAnalyticsReady(measurementId);

    const pagePath = getAnalyticsPagePath();
    const sent = pushPageViewEvent(measurementId, pagePath, "initial");
    if (!sent) {
      window.setTimeout(() => {
        pushPageViewEvent(measurementId, pagePath, "initial");
      }, 0);
    }
  };
}
