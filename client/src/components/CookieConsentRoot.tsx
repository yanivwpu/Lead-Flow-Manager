import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  COOKIE_CONSENT_STORAGE_KEY,
  GA_MEASUREMENT_ID,
  isEuUkEeaCountry,
  loadGoogleAnalytics,
  readStoredConsent,
  writeStoredConsent,
  type StoredCookieConsent,
} from "@/lib/cookieConsent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type GeoResponse = { country: string | null; source?: string };

type CookieConsentContextValue = {
  openPreferences: () => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function useCookieConsent(): CookieConsentContextValue {
  const ctx = useContext(CookieConsentContext);
  if (!ctx) {
    return { openPreferences: () => {} };
  }
  return ctx;
}

export function CookieConsentRoot({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredCookieConsent | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [analyticsToggle, setAnalyticsToggle] = useState(false);

  const { data: geoData, isFetched: geoFetched, isError: geoError } = useQuery({
    queryKey: ["/api/geo"],
    queryFn: async (): Promise<GeoResponse> => {
      const res = await fetch("/api/geo", { credentials: "include" });
      if (!res.ok) return { country: null, source: "error" };
      return res.json();
    },
    staleTime: 86_400_000,
    retry: 1,
  });

  const geo: GeoResponse | undefined = useMemo(() => {
    if (!geoFetched) return undefined;
    if (geoError) return { country: null, source: "error" };
    return geoData;
  }, [geoData, geoFetched, geoError]);

  useEffect(() => {
    setStored(readStoredConsent());
    setHydrated(true);
  }, []);

  /** Implicit consent when region is known non-EU, or unknown (conservative banner only for confirmed EU/UK). */
  useEffect(() => {
    if (!hydrated || stored !== null || !geoFetched || !geo) return;

    const code = geo.country;

    if (code && isEuUkEeaCountry(code)) {
      console.info("[GA4] consent pending — EU/UK/EEA visitor must accept analytics", {
        country: code,
        source: geo.source ?? null,
      });
      return;
    }

    if (code && !isEuUkEeaCountry(code)) {
      const c: StoredCookieConsent = {
        v: 1,
        analytics: true,
        decidedAt: new Date().toISOString(),
        basis: "implicit-non-eu",
      };
      console.info("[GA4] consent granted — implicit non-EU", { country: code, source: geo.source ?? null });
      writeStoredConsent(c);
      setStored(c);
      loadGoogleAnalytics(GA_MEASUREMENT_ID);
      return;
    }

    // Country unknown — allow analytics (do not block anonymous visitors on Railway / without geo headers).
    const c: StoredCookieConsent = {
      v: 1,
      analytics: true,
      decidedAt: new Date().toISOString(),
      basis: "implicit-unknown-region",
    };
    console.info("[GA4] consent granted — implicit unknown region", { source: geo.source ?? null });
    writeStoredConsent(c);
    setStored(c);
    loadGoogleAnalytics(GA_MEASUREMENT_ID);
  }, [hydrated, stored, geo, geoFetched]);

  /** Load GA when stored consent allows analytics */
  useEffect(() => {
    if (!hydrated || !stored?.analytics) return;
    loadGoogleAnalytics(GA_MEASUREMENT_ID);
  }, [hydrated, stored]);

  const showBanner = useMemo(() => {
    if (!hydrated || stored !== null || !geoFetched || !geo) return false;
    const code = geo.country;
    return !!(code && isEuUkEeaCountry(code));
  }, [hydrated, stored, geo, geoFetched]);

  const persistExplicit = useCallback((analytics: boolean) => {
    const c: StoredCookieConsent = {
      v: 1,
      analytics,
      decidedAt: new Date().toISOString(),
      basis: "explicit",
    };
    console.info("[GA4] consent explicit choice", { analytics });
    writeStoredConsent(c);
    setStored(c);
    if (analytics) {
      loadGoogleAnalytics(GA_MEASUREMENT_ID);
    }
  }, []);

  const acceptAnalytics = useCallback(() => {
    persistExplicit(true);
    setPrefsOpen(false);
  }, [persistExplicit]);

  const rejectAnalytics = useCallback(() => {
    persistExplicit(false);
    setPrefsOpen(false);
  }, [persistExplicit]);

  const openPreferences = useCallback(() => {
    setPrefsOpen(true);
  }, []);

  useEffect(() => {
    if (!prefsOpen) return;
    setAnalyticsToggle(readStoredConsent()?.analytics ?? false);
  }, [prefsOpen]);

  const savePreferences = useCallback(() => {
    persistExplicit(analyticsToggle);
    setPrefsOpen(false);
  }, [analyticsToggle, persistExplicit]);

  const ctx = useMemo(() => ({ openPreferences }), [openPreferences]);

  return (
    <CookieConsentContext.Provider value={ctx}>
      {children}

      {showBanner && (
        <div
          className={cn(
            "fixed bottom-0 left-0 right-0 z-[100] border-t border-gray-200/80 bg-white/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-sm",
            "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          )}
          role="region"
          aria-label="Cookie consent"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:py-3.5 md:px-6">
            <p className="text-sm leading-snug text-gray-600">
              We use essential cookies to run WhachatCRM. With your permission, we also use analytics cookies to improve
              the product.
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
              <Button type="button" variant="ghost" size="sm" className="text-gray-600 h-9" onClick={openPreferences}>
                Manage preferences
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-9 border-gray-200" onClick={rejectAnalytics}>
                Reject analytics
              </Button>
              <Button type="button" size="sm" className="h-9 bg-gray-900 text-white hover:bg-gray-800" onClick={acceptAnalytics}>
                Accept analytics
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Cookie preferences</DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              Choose whether we may use analytics cookies. Essential cookies are always on so the service works.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-sm font-medium text-gray-900">Essential cookies</Label>
                  <p className="mt-0.5 text-xs text-gray-500">Required for sign-in, security, and core functionality.</p>
                </div>
                <span className="text-xs font-medium text-gray-400">Always on</span>
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="analytics-cookies" className="text-sm font-medium text-gray-900">
                    Analytics cookies
                  </Label>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Help us understand usage in aggregate (Google Analytics). No ads personalization from this toggle.
                  </p>
                </div>
                <Switch
                  id="analytics-cookies"
                  checked={analyticsToggle}
                  onCheckedChange={setAnalyticsToggle}
                  className="mt-0.5 shrink-0"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setPrefsOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-gray-900 text-white hover:bg-gray-800" onClick={savePreferences}>
              Save preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CookieConsentContext.Provider>
  );
}
