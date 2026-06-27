import type { SeoRelatedLink } from "./types";

/** Cross-link cluster for SEO landing pages */
export const SEO_CLUSTER_LINKS = {
  whatsappCrm: { href: "/whatsapp-crm", label: "WhatsApp CRM" },
  whatsappApi: { href: "/whatsapp-business-api", label: "WhatsApp Business API" },
  unifiedInbox: { href: "/unified-inbox", label: "Unified Inbox" },
  sharedInbox: { href: "/shared-team-inbox", label: "Shared Team Inbox" },
  shopifyCrm: { href: "/shopify-crm", label: "Shopify CRM" },
  realEstateCrm: { href: "/real-estate-crm", label: "Real Estate CRM" },
  mlsIntegration: { href: "/crm-with-mls-integration", label: "CRM with MLS Integration" },
  aiLeadScoring: { href: "/ai-lead-scoring", label: "AI Lead Scoring" },
  automationTemplates: { href: "/automation-templates", label: "Automation Templates" },
  userGuide: { href: "/user-guide", label: "Help Center Guide" },
  bestCrm2026: { href: "/best-whatsapp-crm-2026", label: "Best WhatsApp CRM 2026" },
  crmForWhatsapp: { href: "/crm-for-whatsapp-business", label: "CRM for WhatsApp Business" },
  realtorGrowth: { href: "/realtor-growth-engine", label: "Realtor Growth Engine" },
  pricing: { href: "/pricing", label: "Pricing" },
} as const satisfies Record<string, SeoRelatedLink>;

export function cluster(...keys: (keyof typeof SEO_CLUSTER_LINKS)[]): SeoRelatedLink[] {
  return keys.map((k) => SEO_CLUSTER_LINKS[k]);
}
