import { Redirect } from "wouter";
import {
  SHOPIFY_RGE_BLOCK_REDIRECT,
  useHideGrowthEngineForShopify,
} from "@/lib/shopifyMerchantExperience";

/** Blocks RGE routes for Shopify-installed accounts (presentation layer only). */
export function ShopifyGrowthEngineRedirect({ children }: { children: React.ReactNode }) {
  const hide = useHideGrowthEngineForShopify();
  if (hide) return <Redirect to={SHOPIFY_RGE_BLOCK_REDIRECT} />;
  return <>{children}</>;
}
