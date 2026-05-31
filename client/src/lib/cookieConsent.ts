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

function queueGtagConsentBootstrap(gtag: GtagFn): void {
  // 1) EEA/UK: default denied until explicit accept (GA only loads after accept anyway).
  gtag("consent", "default", {
    ...GA_CONSENT_ALL_DENIED,
    region: EU_UK_EEA_REGIONS,
  });
  // 2) Global baseline denied — required before update; gtag.js regional defaults won't win.
  gtag("consent", "default", GA_CONSENT_ALL_DENIED);
  // 3) Our CMP already granted analytics — update BEFORE js/config so hits are not cookieless.
  gtag("consent", "update", GA_CONSENT_ANALYTICS_GRANTED);

  console.info("[GA4] consent bootstrap queued", {
    default: GA_CONSENT_ALL_DENIED,
    update: GA_CONSENT_ANALYTICS_GRANTED,
    expectedCollectGcs: "G101",
  });
}

function applyAnalyticsConsentUpdate(source: string): void {
  const gtag = gtagWindow().gtag;
  if (typeof gtag !== "function") {
    console.info("[GA4] consent update skipped — gtag not ready", { source });
    return;
  }
  gtag("consent", "update", GA_CONSENT_ANALYTICS_GRANTED);
  console.info("[GA4] consent update applied", {
    source,
    ...GA_CONSENT_ANALYTICS_GRANTED,
    expectedCollectGcs: "G101",
  });
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
  gtag?: GtagFn;
};

type GtagFn = {
  (...args: unknown[]): void;
  /** Set on our pre-load stub; real gtag.js clears this when it takes over. */
  __whachatStub?: true;
};

function gtagWindow(): GtagWindow {
  return window as GtagWindow;
}

function isWhachatGtagStub(gtag: GtagFn | undefined): boolean {
  return typeof gtag === "function" && gtag.__whachatStub === true;
}

function ensureGtagStub(): GtagFn {
  const w = gtagWindow();
  w.dataLayer = w.dataLayer || [];
  if (typeof w.gtag === "function" && !isWhachatGtagStub(w.gtag)) {
    return w.gtag;
  }
  const stub: GtagFn = function gtagStub() {
    // Must match Google's snippet: push `arguments`, not a rest-param array.
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer!.push(arguments);
  };
  stub.__whachatStub = true;
  w.gtag = stub;
  return stub;
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

  const logHit = (url: string, via: string) => {
    if (!matchCollect(url)) return;
    collectHitIndex += 1;
    const consent = parseCollectConsentParams(url);
    const cookielessPing = consent?.analyticsStorageGranted === false;
    console.info("[GA4] collect request observed", {
      via,
      hitIndex: collectHitIndex,
      measurementId,
      hasTid: url.includes(measurementId) || url.includes("tid="),
      consent,
      cookielessPing,
      ...(cookielessPing
        ? {
            warning:
              "analytics_storage denied in collect URL (gcs G100) — Realtime will not count this hit",
          }
        : {}),
    });
  };

  const origFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    logHit(url, "fetch");
    return origFetch(input, init);
  }) as typeof window.fetch;

  const origBeacon = navigator.sendBeacon?.bind(navigator);
  if (origBeacon) {
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      logHit(typeof url === "string" ? url : url.href, "sendBeacon");
      return origBeacon(url, data);
    };
  }

  window.setTimeout(() => {
    const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    for (const e of entries) {
      if (matchCollect(e.name)) {
        console.info("[GA4] collect already in resource timing", {
          url: e.name.slice(0, 220),
          measurementId,
        });
      }
    }
  }, 3000);

  if ("PerformanceObserver" in window) {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          logHit(entry.name, "resource");
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
    gtagType: typeof w.gtag,
    gtagIsStub: isWhachatGtagStub(w.gtag),
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
  const w = gtagWindow();
  const gtag = w.gtag;
  if (typeof gtag !== "function") {
    console.warn("[GA4] page_view skipped — gtag is not a function", { pagePath, source });
    return false;
  }

  const payload = {
    page_path: pagePath,
    page_location: window.location.href,
    page_title: document.title,
  };

  console.info("[GA4] page_view dispatch", {
    source,
    measurementId,
    payload,
    gtagIsStub: isWhachatGtagStub(gtag),
    dataLayerLength: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
  });

  gtag("event", "page_view", payload);

  console.info("[GA4] page_view queued", {
    source,
    pagePath,
    gtagIsStub: isWhachatGtagStub(w.gtag),
    dataLayerLength: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
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

  const gtag = ensureGtagStub();

  // Consent default (denied) + update (analytics granted) MUST precede js/config.
  queueGtagConsentBootstrap(gtag);
  gtag("js", new Date());
  // Manual page_view only after onload consent re-apply — avoids cookieless config hit.
  gtag("config", measurementId, { send_page_view: false });

  console.info("[GA4] bootstrap queued", {
    measurementId,
    dataLayerLength: gtagWindow().dataLayer?.length ?? 0,
    gtagIsStub: isWhachatGtagStub(gtagWindow().gtag),
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
    const gtagAfterLoad = w.gtag;
    const stillStub = isWhachatGtagStub(gtagAfterLoad);

    console.info("[GA4] gtag script onload", {
      measurementId,
      gtagIsStub: stillStub,
      gtagType: typeof gtagAfterLoad,
      dataLayerLength: Array.isArray(w.dataLayer) ? w.dataLayer.length : null,
    });

    if (stillStub) {
      console.warn(
        "[GA4] gtag.js did not replace stub — collect hits will not fire until real gtag loads",
      );
    }

    // Re-apply update after gtag.js init in case built-in regional defaults reset consent.
    applyAnalyticsConsentUpdate("gtag-script-onload");

    notifyGoogleAnalyticsReady(measurementId);

    const pagePath = getAnalyticsPagePath();
    pushPageViewEvent(measurementId, pagePath, "initial");
  };
}
