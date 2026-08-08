/**
 * Public marketing header navigation — destinations must match real App routes
 * or stable homepage section IDs. Do not invent placeholder URLs.
 */

export type MarketingNavLink = {
  label: string;
  href: string;
  description: string;
};

export type MarketingNavGroup = {
  title: string;
  items: MarketingNavLink[];
};

export type MarketingNavDropdown = {
  id: "product" | "solutions" | "resources";
  label: string;
  groups: MarketingNavGroup[];
};

/** Product = what WhachatCRM provides */
export const PRODUCT_NAV: MarketingNavDropdown = {
  id: "product",
  label: "Product",
  groups: [
    {
      title: "AI Sales Team",
      items: [
        {
          label: "Prospect AI",
          href: "/prospect-ai",
          description: "Find and qualify local businesses to sell to",
        },
        {
          label: "AI Brain",
          href: "/#ai-brain",
          description: "Strategy, personalization, and AI across the platform",
        },
        {
          label: "AI Copilot",
          href: "/#ai-copilot",
          description: "Assist replies and next steps inside conversations",
        },
      ],
    },
    {
      title: "Messaging & Automation",
      items: [
        {
          label: "Unified Inbox",
          href: "/unified-inbox",
          description: "Customer messaging channels in one workspace",
        },
        {
          label: "Automations",
          href: "/automation-templates",
          description: "Follow-up workflows and ready-to-use templates",
        },
        {
          label: "Chatbots",
          href: "/whatsapp-business-api#inbox-automation",
          description: "Automated flows for WhatsApp and messaging",
        },
        {
          label: "Campaigns",
          href: "/automation-templates#support-nurture",
          description: "Nurture and re-engagement sequences",
        },
      ],
    },
    {
      title: "Growth Engines",
      items: [
        {
          label: "Realtor Growth Engine",
          href: "/realtor-growth-engine",
          description: "Live Growth Engine for real estate teams",
        },
      ],
    },
    {
      title: "Platform",
      items: [
        {
          label: "Integrations",
          href: "/#integrations",
          description: "Meta, Shopify, Gmail, Stripe, and more",
        },
        {
          label: "Team Collaboration",
          href: "/shared-team-inbox",
          description: "Shared ownership, notes, and assignments",
        },
      ],
    },
  ],
};

/**
 * Solutions = industries / how businesses use the products.
 * Omitted (no suitable public page yet): Travel & Hospitality.
 */
export const SOLUTIONS_NAV: MarketingNavDropdown = {
  id: "solutions",
  label: "Solutions",
  groups: [
    {
      title: "Industries",
      items: [
        {
          label: "Real Estate",
          href: "/real-estate-crm",
          description: "Capture, qualify and convert buyers and sellers",
        },
        {
          label: "E-commerce",
          href: "/solutions/ecommerce",
          description: "Turn shopper conversations into repeat customers",
        },
        {
          label: "Local & Service Businesses",
          href: "/solutions/local-service-businesses",
          description: "Find leads, book work and automate follow-up",
        },
        {
          label: "Marketing Agencies",
          href: "/solutions/marketing-agencies",
          description: "Deliver messaging, automation and AI for clients",
        },
        {
          label: "Med Spas & Wellness",
          href: "/solutions/med-spas",
          description: "Turn inquiries into booked consultations",
        },
      ],
    },
  ],
};

export const RESOURCES_NAV: MarketingNavDropdown = {
  id: "resources",
  label: "Resources",
  groups: [
    {
      title: "Learn",
      items: [
        {
          label: "Blog",
          href: "/blog",
          description: "Guides and product updates",
        },
        {
          label: "Help Center",
          href: "/help",
          description: "Answers and product support",
        },
        {
          label: "User Guide",
          href: "/user-guide",
          description: "Step-by-step product learning",
        },
      ],
    },
    {
      title: "Compare WhachatCRM",
      items: [
        {
          label: "Best WhatsApp CRM 2026",
          href: "/best-whatsapp-crm-2026",
          description: "Buying guide and platform comparison",
        },
        {
          label: "WATI Alternative",
          href: "/wati-alternative",
          description: "Compare ops-focused WhatsApp tools",
        },
        {
          label: "ManyChat Alternative",
          href: "/manychat-alternative",
          description: "Compare social automation vs CRM inbox",
        },
        {
          label: "Respond.io Alternative",
          href: "/respond-io-alternative",
          description: "Compare omnichannel platforms",
        },
        {
          label: "More alternatives",
          href: "/best-whatsapp-crm-2026",
          description: "Interakt, Zoko, Pabbly, 360dialog, and more",
        },
      ],
    },
    {
      title: "Partners",
      items: [
        {
          label: "Partner Program",
          href: "/partner-program",
          description: "Grow with WhachatCRM as a partner",
        },
      ],
    },
  ],
};

export const MARKETING_NAV_DROPDOWNS: MarketingNavDropdown[] = [
  PRODUCT_NAV,
  SOLUTIONS_NAV,
  RESOURCES_NAV,
];

/** Flat list for SSR / static crawlable HTML and tests */
export function getAllMarketingNavLinks(): MarketingNavLink[] {
  return MARKETING_NAV_DROPDOWNS.flatMap((d) => d.groups.flatMap((g) => g.items));
}

/** Destinations intentionally omitted from Solutions (no suitable public page). */
export const OMITTED_SOLUTIONS = [
  {
    label: "Travel & Hospitality",
    reason: "No dedicated industry landing route",
  },
] as const;
