import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { trackShopifyActivation } from "@/lib/shopifyActivationTelemetry";

/** Place inside the page Suspense + error boundary: fallback/error renders do not count. */
export function ShopifySuccessfulRender({ isShopify }: { isShopify: boolean }) {
  const { user } = useAuth();
  const [location] = useLocation();
  useEffect(() => {
    if (!isShopify || !user) return;
    const page = location.startsWith("/app/inbox") ? "inbox" :
      location.startsWith("/app/integrations") || location.startsWith("/app/settings") ? "integrations" : "other";
    void trackShopifyActivation(user.id, "first_successful_render", page);
  }, [isShopify, user?.id, location]);
  return null;
}

/** A successful server activation read, not a CTA click, confirms channel setup. */
export function useShopifyActivationObservation(
  userId: string | undefined, isShopify: boolean, hasAnyMessagingChannel: boolean | undefined,
) {
  const account = useRef<string | undefined>(undefined);
  const observedWithoutChannel = useRef(false);
  useEffect(() => {
    if (account.current !== userId) {
      account.current = userId;
      observedWithoutChannel.current = false;
    }
    if (!userId || !isShopify) return;
    void trackShopifyActivation(userId, "first_app_page_reached", "other");
    if (hasAnyMessagingChannel === false) observedWithoutChannel.current = true;
    if (hasAnyMessagingChannel === true && observedWithoutChannel.current) {
      void trackShopifyActivation(userId, "first_channel_setup", "integrations");
    }
  }, [userId, isShopify, hasAnyMessagingChannel]);
}
