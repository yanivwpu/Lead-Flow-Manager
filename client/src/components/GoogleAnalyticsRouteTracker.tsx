import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  getAnalyticsPagePath,
  hasAnalyticsConsent,
  isGoogleAnalyticsReady,
  onGoogleAnalyticsReady,
  trackGoogleAnalyticsPageView,
} from "@/lib/cookieConsent";

/**
 * Sends GA4 page_view on wouter route changes after analytics consent + gtag load.
 */
export function GoogleAnalyticsRouteTracker() {
  const [location] = useLocation();

  useEffect(() => {
    if (!hasAnalyticsConsent()) return;

    const pagePath = getAnalyticsPagePath();

    const send = () => trackGoogleAnalyticsPageView(pagePath);

    if (isGoogleAnalyticsReady()) {
      send();
      return;
    }

    return onGoogleAnalyticsReady(send);
  }, [location]);

  return null;
}
