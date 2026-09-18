import { CANONICAL_HOST, PHASE2_LOCALIZED_PATHS } from "./localeRoutes";
import { SEO_CURRENT_SELF_SERVICE_PRODUCTS } from "./seoPolicy";

export type SeoTarget = { keyword: string; canonicalPage: string; priority: "primary" | "supporting" };

/** Central monitoring registry. Canonicals come from the Phase 1 route policy and
 * product targets are limited to products the product-fact policy says are current. */
const routeTargets: Partial<Record<(typeof PHASE2_LOCALIZED_PATHS)[number], readonly string[]>> = {
  "/": ["whatsapp crm"],
  "/pricing": ["whatsapp crm pricing"],
  "/unified-inbox": ["unified messaging inbox", "shared whatsapp inbox"],
  "/automations": ["whatsapp automation"],
  "/chatbot-builder": ["whatsapp chatbot builder"],
  "/prospect-ai": ["ai prospecting"],
  "/realtor-growth-engine": ["real estate lead follow up"],
  "/real-estate-crm": ["whatsapp crm for real estate"],
};

export const SEO_TARGETS: readonly SeoTarget[] = Object.entries(routeTargets).flatMap(([path, keywords]) =>
  (keywords ?? []).map((keyword, index) => ({
    keyword,
    canonicalPage: `${CANONICAL_HOST}${path === "/" ? "" : path}`,
    priority: index === 0 ? "primary" as const : "supporting" as const,
  })),
);

export const SEO_TARGET_REGISTRY_METADATA = {
  policySource: "shared/seoPolicy.ts",
  currentProductFactCount: SEO_CURRENT_SELF_SERVICE_PRODUCTS.length,
} as const;
