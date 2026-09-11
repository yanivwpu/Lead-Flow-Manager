import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  syncMarketingWebsiteChatWidget,
  type MarketingChatWidgetDom,
  type MarketingChatWidgetWindow,
} from "@shared/marketingWebsiteChatWidget";

/**
 * Loads the official Website Chat snippet once on public marketing hosts.
 * Path/host gating lives in shared/marketingWebsiteChatWidget.ts.
 */
export function MarketingWebsiteChatWidget() {
  const [location] = useLocation();

  useEffect(() => {
    syncMarketingWebsiteChatWidget(
      {
        hostname: window.location.hostname,
        pathname: window.location.pathname,
        search: window.location.search,
        htmlClassName: document.documentElement.className,
      },
      window as MarketingChatWidgetWindow,
      document as unknown as MarketingChatWidgetDom,
    );
  }, [location]);

  return null;
}
