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
    console.info("[GA4] collect request observed", {
      via,
      url: url.slice(0, 220),
      measurementId,
      hasTid: url.includes(measurementId) || url.includes("tid="),
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

  // Queue commands before gtag.js executes (Google's required bootstrap order).
  gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("js", new Date());
  gtag("config", measurementId, { send_page_view: true });

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

    notifyGoogleAnalyticsReady(measurementId);

    const pagePath = getAnalyticsPagePath();
    pushPageViewEvent(measurementId, pagePath, "initial");
  };
}
