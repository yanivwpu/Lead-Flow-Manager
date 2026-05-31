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

const EU_UK_EEA_REGIONS = [...EU_UK_EEA];

const GA_CONSENT_ALL_DENIED = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

/** Analytics-only grant — ads stay denied (matches our cookie banner). */
const GA_CONSENT_ANALYTICS_GRANTED = {
  analytics_storage: "granted",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const;

type CollectConsentParams = {
  gcs: string | null;
  gcd: string | null;
  pscdl: string | null;
  gcu: string | null;
  npa: string | null;
  adStorageGranted: boolean | null;
  analyticsStorageGranted: boolean | null;
};

function parseCollectConsentParams(url: string): CollectConsentParams | null {
  try {
    const u = new URL(url, window.location.origin);
    const gcs = u.searchParams.get("gcs");
    let adStorageGranted: boolean | null = null;
    let analyticsStorageGranted: boolean | null = null;
    // gcs format: G1 + ad_storage (0|1) + analytics_storage (0|1)
    if (gcs && gcs.startsWith("G") && gcs.length >= 4) {
      adStorageGranted = gcs.charAt(2) === "1";
      analyticsStorageGranted = gcs.charAt(3) === "1";
    }
    return {
      gcs,
      gcd: u.searchParams.get("gcd"),
      pscdl: u.searchParams.get("pscdl"),
      gcu: u.searchParams.get("gcu"),
      npa: u.searchParams.get("npa"),
      adStorageGranted,
      analyticsStorageGranted,
    };
  } catch {
    return null;
  }
}

type CollectHitSummary = CollectConsentParams & {
  tid: string | null;
  en: string | null;
  cid: string | null;
  sid: string | null;
  dl: string | null;
  _s: string | null;
  v: string | null;
};

function parseCollectHitSummary(url: string): CollectHitSummary | null {
  try {
    const u = new URL(url, window.location.origin);
    const consent = parseCollectConsentParams(url);
    if (!consent) return null;
    return {
      ...consent,
      tid: u.searchParams.get("tid"),
      en: u.searchParams.get("en"),
      cid: u.searchParams.get("cid"),
      sid: u.searchParams.get("sid"),
      dl: u.searchParams.get("dl"),
      _s: u.searchParams.get("_s"),
      v: u.searchParams.get("v"),
    };
  } catch {
    return null;
  }
}

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
    if (gaInjected) {
      applyAnalyticsConsentUpdate("stored-consent-granted");
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

/**
 * Standard Google gtag bootstrap (must run before gtag/js loads):
 *   window.dataLayer = window.dataLayer || [];
 *   function gtag(){window.dataLayer.push(arguments);}
 *   window.gtag = gtag;
 */
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

function isUsableGtag(): boolean {
  return typeof gtagWindow().gtag === "function";
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

  console.info("[GA4] consent bootstrap queued", {
    default: GA_CONSENT_ALL_DENIED,
    update: GA_CONSENT_ANALYTICS_GRANTED,
    expectedCollectGcs: "G101",
    gtagUsable: isUsableGtag(),
  });
}

function applyAnalyticsConsentUpdate(source: string): void {
  callGtag("consent", "update", GA_CONSENT_ANALYTICS_GRANTED);
  console.info("[GA4] consent update applied", {
    source,
    gtagUsable: isUsableGtag(),
    ...GA_CONSENT_ANALYTICS_GRANTED,
    expectedCollectGcs: "G101",
  });
}

let collectObserverInstalled = false;
let collectHitIndex = 0;

/** Temporary: log when the browser sends GA4 collect/beacon requests. */
function installCollectNetworkObserver(measurementId: string): void {
  if (collectObserverInstalled || typeof window === "undefined") return;
  collectObserverInstalled = true;

  const matchCollect = (url: string) =>
    /google-analytics\.com\/g\/collect|google-analytics\.com\/j\/collect|analytics\.google\.com\/g\/collect/.test(
      url,
    );

  const logHit = (url: string, via: string, responseStatus?: number) => {
    if (!matchCollect(url)) return;
    collectHitIndex += 1;
    const hit = parseCollectHitSummary(url);
    const cookielessPing = hit?.analyticsStorageGranted === false;
    const isMeasurementHit =
      hit?.tid === measurementId &&
      hit?.en === "page_view" &&
      hit?.analyticsStorageGranted === true &&
      !!hit?.cid;
    console.info("[GA4] collect request observed", {
      via,
      hitIndex: collectHitIndex,
      measurementId,
      responseStatus: responseStatus ?? null,
      hit,
      isMeasurementHit,
      cookielessPing,
      ...(responseStatus != null && responseStatus !== 204 && responseStatus !== 200
        ? { warning: `unexpected collect HTTP status ${responseStatus}` }
        : {}),
      ...(cookielessPing
        ? {
            warning:
              "analytics_storage denied in collect URL (gcs G100) — Realtime will not count this hit",
          }
        : {}),
      ...(!isMeasurementHit && !cookielessPing
        ? {
            warning:
              "collect fired but may not be a full page_view measurement hit — check tid/en/cid",
          }
        : {}),
    });
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const matched = matchCollect(url);
    return origFetch(input, init).then((response) => {
      if (matched) logHit(url, "fetch", response.status);
      return response;
    });
  }) as typeof window.fetch;

  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      const href = typeof url === "string" ? url : url.href;
      const ok = origBeacon(url, data);
      if (matchCollect(href)) logHit(href, "sendBeacon", ok ? 204 : 0);
      return ok;
    };
  }

  window.setTimeout(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (const e of entries) {
      if (matchCollect(e.name)) {
        const status = "responseStatus" in e ? (e as PerformanceResourceTiming & { responseStatus?: number }).responseStatus : undefined;
        logHit(e.name, "resource-timing", status);
      }
    }
  }, 3000);

  if ("PerformanceObserver" in window) {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const timing = entry as PerformanceResourceTiming & { responseStatus?: number };
          logHit(entry.name, "resource", timing.responseStatus);
        }
      });
      obs.observe({ type: "resource", buffered: true });
    } catch {
      // ignore unsupported buffered option
    }
  }
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
    gtagUsable: isUsableGtag(),
    gtagType: typeof w.gtag,
    dataLayerLength: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
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
  const payload = {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  };

  console.info("[GA4] page_view dispatch", {
    source,
    measurementId,
    payload,
    gtagUsable: isUsableGtag(),
    dataLayerLength: Array.isArray(gtagWindow().dataLayer) ? gtagWindow().dataLayer!.length : null,
  });

  callGtag("event", "page_view", payload);

  console.info("[GA4] page_view queued", {
    source,
    pagePath,
    gtagUsable: isUsableGtag(),
  });
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
  installCollectNetworkObserver(measurementId);

  ensureGoogleGtagSnippet();
  queueGtagConsentBootstrap();
  callGtag("js", new Date());
  callGtag("config", measurementId, { send_page_view: false });

  console.info("[GA4] bootstrap queued", {
    measurementId,
    dataLayerLength: gtagWindow().dataLayer?.length ?? 0,
    gtagUsable: isUsableGtag(),
    gtagType: typeof gtagWindow().gtag,
  });

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
    const w = gtagWindow();
    const gtagUsable = isUsableGtag();

    console.info("[GA4] gtag script onload", {
      measurementId,
      gtagUsable,
      gtagType: typeof w.gtag,
      dataLayerLength: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
    });

    if (!gtagUsable) {
      console.warn("[GA4] window.gtag is not a function after gtag.js onload");
    }

    applyAnalyticsConsentUpdate("gtag-script-onload");

    notifyGoogleAnalyticsReady(measurementId);

    const pagePath = getAnalyticsPagePath();
    pushPageViewEvent(measurementId, pagePath, "initial");
  };
}
