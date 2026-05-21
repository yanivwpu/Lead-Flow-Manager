import { lazy, Suspense } from "react";
import { ShopifyBootstrapScreen } from "@/components/ShopifyBootstrapScreen";
import { ShopifyBootstrapFade } from "@/components/ShopifyBootstrapFade";
import { clearShopifyPostInstallPricingPath } from "@/lib/shopifyBootstrap";
import { useEffect } from "react";

const Pricing = lazy(() => import("@/pages/Pricing").then((m) => ({ default: m.Pricing })));
const AuthPage = lazy(() => import("@/pages/Auth").then((m) => ({ default: m.AuthPage })));

type ShopifyBootstrapRoutesProps = {
  destination: string;
  postInstallFlow: boolean;
};

/**
 * Minimal route surface during Shopify bootstrap — never mounts Welcome or /app/*.
 */
export function ShopifyBootstrapRoutes({ destination, postInstallFlow }: ShopifyBootstrapRoutesProps) {
  const path = destination.split("?")[0].replace(/\/$/, "") || "/";

  useEffect(() => {
    if (postInstallFlow && path === "/pricing") {
      clearShopifyPostInstallPricingPath();
    }
  }, [path, postInstallFlow]);

  return (
    <ShopifyBootstrapFade>
      <Suspense fallback={<ShopifyBootstrapScreen />}>
        {path === "/pricing" ? <Pricing /> : path === "/auth" ? <AuthPage /> : <ShopifyBootstrapScreen />}
      </Suspense>
    </ShopifyBootstrapFade>
  );
}
