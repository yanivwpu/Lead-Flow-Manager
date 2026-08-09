/**
 * Public-site footer structure and localized chrome.
 * Destinations must match existing App routes — do not invent paths.
 */

import type { MarketingLocale } from "./marketingLocale";
import { localizedInternalHref } from "./localeRoutes";
import {
  WHACHAT_SOCIAL_PROFILES,
  socialAriaLabel,
  type WhachatSocialProfile,
} from "./whachatSocialProfiles";

export type SiteFooterLinkAction = "cookiePreferences";

export type SiteFooterLinkDef = {
  id: string;
  /** English path when navigable; omit for action-only controls. */
  href?: string;
  /** When true, apply Phase 2 localizedInternalHref for the active locale. */
  localizeHref?: boolean;
  action?: SiteFooterLinkAction;
  /** English label (overridden per locale when translated). */
  label: string;
};

export type SiteFooterColumnId =
  | "product"
  | "solutions"
  | "resources"
  | "compare"
  | "legal";

export type SiteFooterColumnDef = {
  id: SiteFooterColumnId;
  heading: string;
  links: SiteFooterLinkDef[];
};

export type SiteFooterChrome = {
  tagline: string;
  /** Full accessible trust phrase (screen readers / SSR). */
  metaTechProvider: string;
  /** Compact trust line 1 — branded term, untranslated. */
  metaTechProviderTitle: string;
  /** Compact trust line 2 — branded term, untranslated. */
  metaTechProviderPlatform: string;
  followUs: string;
  footerNavAria: string;
  /** Accessible label template; keep WhachatCRM + platform names untranslated. */
  socialAriaTemplate: string;
  /** Copyright template; use `{{year}}` for the calendar year. */
  copyrightTemplate: string;
  columnHeadings: Record<SiteFooterColumnId, string>;
  /** Overrides for translated link labels by link id. */
  linkLabels: Partial<Record<string, string>>;
};

/** First Product subcolumn (desktop two-column layout). */
export const PRODUCT_FOOTER_COL_A_IDS = [
  "prospect-ai",
  "ai-brain",
  "ai-copilot",
  "unified-inbox",
  "workflows",
] as const;

/** Second Product subcolumn (desktop two-column layout). */
export const PRODUCT_FOOTER_COL_B_IDS = [
  "chatbot-builder",
  "campaigns",
  "realtor-growth-engine",
  "integrations",
  "team-collaboration",
] as const;

export function formatFooterCopyright(template: string, year = new Date().getFullYear()): string {
  return template.replace(/\{\{\s*year\s*\}\}/g, String(year));
}

const PRODUCT_LINKS: SiteFooterLinkDef[] = [
  { id: "prospect-ai", href: "/prospect-ai", localizeHref: true, label: "Prospect AI" },
  { id: "ai-brain", href: "/ai-brain", localizeHref: true, label: "AI Brain" },
  { id: "ai-copilot", href: "/ai-copilot", localizeHref: true, label: "AI Copilot" },
  { id: "unified-inbox", href: "/unified-inbox", localizeHref: true, label: "Unified Inbox" },
  {
    id: "workflows",
    href: "/automations",
    localizeHref: true,
    label: "Workflows & Automations",
  },
  {
    id: "chatbot-builder",
    href: "/chatbot-builder",
    localizeHref: true,
    label: "Chatbot Builder",
  },
  { id: "campaigns", href: "/campaigns", localizeHref: true, label: "Campaigns" },
  {
    id: "realtor-growth-engine",
    href: "/realtor-growth-engine",
    localizeHref: true,
    label: "Realtor Growth Engine",
  },
  { id: "integrations", href: "/integrations", localizeHref: true, label: "Integrations" },
  {
    id: "team-collaboration",
    href: "/shared-team-inbox",
    localizeHref: true,
    label: "Team Collaboration",
  },
];

const SOLUTION_LINKS: SiteFooterLinkDef[] = [
  { id: "real-estate", href: "/real-estate-crm", localizeHref: true, label: "Real Estate" },
  { id: "ecommerce", href: "/solutions/ecommerce", localizeHref: true, label: "E-commerce" },
  {
    id: "local-service",
    href: "/solutions/local-service-businesses",
    localizeHref: true,
    label: "Local & Service Businesses",
  },
  {
    id: "marketing-agencies",
    href: "/solutions/marketing-agencies",
    localizeHref: true,
    label: "Marketing Agencies",
  },
  {
    id: "med-spas",
    href: "/solutions/med-spas",
    localizeHref: true,
    label: "Med Spas & Wellness",
  },
];

const RESOURCE_LINKS: SiteFooterLinkDef[] = [
  { id: "pricing", href: "/pricing", localizeHref: true, label: "Pricing" },
  { id: "blog", href: "/blog", localizeHref: false, label: "Blog" },
  { id: "help", href: "/help", localizeHref: false, label: "Help Center" },
  { id: "user-guide", href: "/user-guide", localizeHref: false, label: "User Guide" },
  {
    id: "partner-program",
    href: "/partner-program",
    localizeHref: false,
    label: "Partner Program",
  },
  { id: "contact", href: "/contact", localizeHref: false, label: "Contact" },
];

const COMPARE_LINKS: SiteFooterLinkDef[] = [
  {
    id: "best-whatsapp-crm",
    href: "/best-whatsapp-crm-2026",
    localizeHref: false,
    label: "Best WhatsApp CRM",
  },
  {
    id: "wati-alt",
    href: "/wati-alternative",
    localizeHref: false,
    label: "WATI Alternative",
  },
  {
    id: "respond-alt",
    href: "/respond-io-alternative",
    localizeHref: false,
    label: "Respond.io Alternative",
  },
  {
    id: "manychat-alt",
    href: "/manychat-alternative",
    localizeHref: false,
    label: "ManyChat Alternative",
  },
  {
    id: "more-alternatives",
    href: "/best-whatsapp-crm-2026",
    localizeHref: false,
    label: "More Alternatives",
  },
];

const LEGAL_LINKS: SiteFooterLinkDef[] = [
  {
    id: "privacy",
    href: "/privacy-policy",
    localizeHref: false,
    label: "Privacy Policy",
  },
  { id: "terms", href: "/terms-of-use", localizeHref: false, label: "Terms of Use" },
  {
    id: "data-deletion",
    href: "/data-deletion",
    localizeHref: false,
    label: "Data Deletion",
  },
  {
    id: "email-preferences",
    href: "/unsubscribe",
    localizeHref: false,
    label: "Email Preferences",
  },
  {
    id: "cookie-preferences",
    action: "cookiePreferences",
    label: "Cookie Preferences",
  },
];

export const SITE_FOOTER_COLUMNS_EN: SiteFooterColumnDef[] = [
  { id: "product", heading: "Product", links: PRODUCT_LINKS },
  { id: "solutions", heading: "Solutions", links: SOLUTION_LINKS },
  { id: "resources", heading: "Resources", links: RESOURCE_LINKS },
  { id: "compare", heading: "Compare", links: COMPARE_LINKS },
  { id: "legal", heading: "Legal", links: LEGAL_LINKS },
];

const CHROME_EN: SiteFooterChrome = {
  tagline:
    "The all-in-one WhatsApp CRM for teams that want to sell more, respond faster, and never lose a lead.",
  metaTechProvider: "Meta Tech Provider for the WhatsApp Business Platform",
  metaTechProviderTitle: "Meta Tech Provider",
  metaTechProviderPlatform: "WhatsApp Business Platform",
  followUs: "Follow us",
  footerNavAria: "Footer",
  socialAriaTemplate: "WhachatCRM on {{platform}}",
  copyrightTemplate: "© {{year}} WhachatCRM. All rights reserved.",
  columnHeadings: {
    product: "Product",
    solutions: "Solutions",
    resources: "Resources",
    compare: "Compare",
    legal: "Legal",
  },
  linkLabels: {},
};

const CHROME_ES: SiteFooterChrome = {
  tagline:
    "El CRM de WhatsApp todo en uno para equipos que quieren vender más, responder más rápido y nunca perder un lead.",
  metaTechProvider: "Meta Tech Provider para WhatsApp Business Platform",
  metaTechProviderTitle: "Meta Tech Provider",
  metaTechProviderPlatform: "WhatsApp Business Platform",
  followUs: "Síguenos",
  footerNavAria: "Pie de página",
  socialAriaTemplate: "WhachatCRM en {{platform}}",
  copyrightTemplate: "© {{year}} WhachatCRM. Todos los derechos reservados.",
  columnHeadings: {
    product: "Producto",
    solutions: "Soluciones",
    resources: "Recursos",
    compare: "Comparar",
    legal: "Legal",
  },
  linkLabels: {
    workflows: "Flujos de trabajo y automatizaciones",
    campaigns: "Campañas",
    integrations: "Integraciones",
    "team-collaboration": "Colaboración en equipo",
    "real-estate": "Bienes raíces",
    ecommerce: "Comercio electrónico",
    "local-service": "Negocios locales y de servicios",
    "marketing-agencies": "Agencias de marketing",
    "med-spas": "Med spas y bienestar",
    pricing: "Precios",
    blog: "Blog",
    help: "Centro de ayuda",
    "user-guide": "Guía de usuario",
    "partner-program": "Programa de partners",
    contact: "Contacto",
    "best-whatsapp-crm": "Mejor CRM de WhatsApp",
    "wati-alt": "Alternativa a WATI",
    "respond-alt": "Alternativa a Respond.io",
    "manychat-alt": "Alternativa a ManyChat",
    "more-alternatives": "Más alternativas",
    privacy: "Política de privacidad",
    terms: "Términos de uso",
    "data-deletion": "Eliminación de datos",
    "email-preferences": "Preferencias de correo",
    "cookie-preferences": "Preferencias de cookies",
  },
};

const CHROME_HE: SiteFooterChrome = {
  tagline:
    "מערכת ה-CRM המקיפה לווטסאפ לצוותים שרוצים למכור יותר, להגיב מהר יותר ולעולם לא לאבד ליד.",
  metaTechProvider: "Meta Tech Provider עבור WhatsApp Business Platform",
  metaTechProviderTitle: "Meta Tech Provider",
  metaTechProviderPlatform: "WhatsApp Business Platform",
  followUs: "עקבו אחרינו",
  footerNavAria: "כותרת תחתונה",
  socialAriaTemplate: "WhachatCRM ב-{{platform}}",
  copyrightTemplate: "© {{year}} WhachatCRM. כל הזכויות שמורות.",
  columnHeadings: {
    product: "מוצר",
    solutions: "פתרונות",
    resources: "משאבים",
    compare: "השוואות",
    legal: "מידע משפטי",
  },
  linkLabels: {
    workflows: "זרימות עבודה ואוטומציות",
    campaigns: "קמפיינים",
    integrations: "אינטגרציות",
    "team-collaboration": "שיתוף פעולה בצוות",
    "real-estate": "נדל״ן",
    ecommerce: "מסחר אלקטרוני",
    "local-service": "עסקים מקומיים ושירותים",
    "marketing-agencies": "סוכנויות שיווק",
    "med-spas": "מדיספה ווולנס",
    pricing: "מחירים",
    blog: "בלוג",
    help: "מרכז עזרה",
    "user-guide": "מדריך למשתמש",
    "partner-program": "תוכנית שותפים",
    contact: "צור קשר",
    "best-whatsapp-crm": "CRM WhatsApp הטוב ביותר",
    "wati-alt": "אלטרנטיבה ל-WATI",
    "respond-alt": "אלטרנטיבה ל-Respond.io",
    "manychat-alt": "אלטרנטיבה ל-ManyChat",
    "more-alternatives": "עוד אלטרנטיבות",
    privacy: "מדיניות פרטיות",
    terms: "תנאי שימוש",
    "data-deletion": "מחיקת נתונים",
    "email-preferences": "העדפות אימייל",
    "cookie-preferences": "העדפות עוגיות",
  },
};

const CHROME_BY_LOCALE: Record<MarketingLocale, SiteFooterChrome> = {
  en: CHROME_EN,
  es: CHROME_ES,
  he: CHROME_HE,
};

/** Brand / product names that stay English across locales. */
const BRAND_LINK_IDS = new Set([
  "prospect-ai",
  "ai-brain",
  "ai-copilot",
  "unified-inbox",
  "chatbot-builder",
  "realtor-growth-engine",
]);

export type ResolvedSiteFooterLink = {
  id: string;
  href: string | null;
  action?: SiteFooterLinkAction;
  label: string;
};

export type ResolvedSiteFooterColumn = {
  id: SiteFooterColumnId;
  heading: string;
  links: ResolvedSiteFooterLink[];
};

export type ResolvedSiteFooter = {
  locale: MarketingLocale;
  tagline: string;
  metaTechProvider: string;
  metaTechProviderTitle: string;
  metaTechProviderPlatform: string;
  followUs: string;
  footerNavAria: string;
  copyright: string;
  columns: ResolvedSiteFooterColumn[];
  social: Array<WhachatSocialProfile & { ariaLabel: string }>;
};

export function getSiteFooterChrome(locale: MarketingLocale): SiteFooterChrome {
  return CHROME_BY_LOCALE[locale] ?? CHROME_EN;
}

export function resolveSiteFooterLinkHref(
  link: SiteFooterLinkDef,
  locale: MarketingLocale,
): string | null {
  if (link.action === "cookiePreferences" || !link.href) return null;
  if (link.localizeHref) return localizedInternalHref(link.href, locale);
  return link.href;
}

export function getLocalizedSiteFooter(
  locale: MarketingLocale,
  year = new Date().getFullYear(),
): ResolvedSiteFooter {
  const chrome = getSiteFooterChrome(locale);
  const columns: ResolvedSiteFooterColumn[] = SITE_FOOTER_COLUMNS_EN.map((col) => ({
    id: col.id,
    heading: chrome.columnHeadings[col.id],
    links: col.links.map((link) => {
      const translated = chrome.linkLabels[link.id];
      const label =
        translated && !BRAND_LINK_IDS.has(link.id) ? translated : link.label;
      return {
        id: link.id,
        href: resolveSiteFooterLinkHref(link, locale),
        action: link.action,
        label,
      };
    }),
  }));

  return {
    locale,
    tagline: chrome.tagline,
    metaTechProvider: chrome.metaTechProvider,
    metaTechProviderTitle: chrome.metaTechProviderTitle,
    metaTechProviderPlatform: chrome.metaTechProviderPlatform,
    followUs: chrome.followUs,
    footerNavAria: chrome.footerNavAria,
    copyright: formatFooterCopyright(chrome.copyrightTemplate, year),
    columns,
    social: WHACHAT_SOCIAL_PROFILES.map((profile) => ({
      ...profile,
      ariaLabel: socialAriaLabel(profile.platformName, chrome.socialAriaTemplate),
    })),
  };
}

/** Flat list of navigable internal footer hrefs (English paths) for route audits. */
export function getSiteFooterEnglishHrefs(): string[] {
  const hrefs: string[] = [];
  for (const col of SITE_FOOTER_COLUMNS_EN) {
    for (const link of col.links) {
      if (link.href) hrefs.push(link.href);
    }
  }
  return hrefs;
}
