import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  getAnalyticsPagePath,
  hasAnalyticsConsent,
  isGoogleAnalyticsReady,
  onAnalyticsConsentGranted,
  onGoogleAnalyticsReady,
  trackGoogleAnalyticsPageView,
} from "@/lib/cookieConsent";

/**
 * Sends GA4 page_view on wouter SPA navigations after analytics consent + gtag load.
 * Initial page_view is fired from loadGoogleAnalytics() when gtag finishes loading.
 */
export function GoogleAnalyticsRouteTracker() {
  const [location] = useLocation();
  const lastTrackedPathRef = useRef<string | null>(null);
  const isFirstLocationEffectRef = useRef(true);

  useEffect(() => {
    const pagePath = getAnalyticsPagePath();

    const sendRoutePageView = () => {
      if (lastTrackedPathRef.current === pagePath) return;
      lastTrackedPathRef.current = pagePath;
      trackGoogleAnalyticsPageView(pagePath);
    };

    const trySendRoute = () => {
      if (!hasAnalyticsConsent()) return;
      if (!isGoogleAnalyticsReady()) {
        return onGoogleAnalyticsReady(sendRoutePageView);
      }
      sendRoutePageView();
    };

    if (isFirstLocationEffectRef.current) {
      isFirstLocationEffectRef.current = false;
      return onAnalyticsConsentGranted(() => {
        if (!isGoogleAnalyticsReady()) {
          return onGoogleAnalyticsReady(() => {
            lastTrackedPathRef.current = getAnalyticsPagePath();
          });
        }
        lastTrackedPathRef.current = getAnalyticsPagePath();
      });
    }

    return trySendRoute();
  }, [location]);

  return null;
}
