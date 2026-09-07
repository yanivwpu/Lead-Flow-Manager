import { RGE_TEMPLATE_DETAIL_PATH } from "./rgePaths";

/** In-app global campaigns (preset/template campaigns only). */
export const APP_CAMPAIGNS_PATH = "/app/campaigns";
export const PRESET_CAMPAIGNS_API = "/api/preset-campaigns";

/** Prospect AI outreach lives in its own Growth Engine workspace, not global Campaigns. */
export const PROSPECT_AI_OUTREACH_API_PREFIX = "/api/growth-engines/prospect-ai";

export const APP_NAV_SECTION_IDS = [
  "main",
  "automationAi",
  "growthEngines",
  "settingsIntegrations",
  "support",
] as const;

export type AppNavSectionId = (typeof APP_NAV_SECTION_IDS)[number];

export const APP_NAV_ITEM_IDS = [
  "inbox",
  "followups",
  "contacts",
  "search",
  "widget",
  "chatbot",
  "automations",
  "campaigns",
  "templates",
  "aiBrain",
  "prospectAi",
  "realtorGrowthEngine",
  "settings",
  "integrations",
  "gettingStarted",
  "help",
] as const;

export type AppNavItemId = (typeof APP_NAV_ITEM_IDS)[number];

export const APP_NAV_MAIN_ITEM_IDS = ["inbox", "followups", "contacts", "search"] as const;
export const APP_NAV_MOBILE_PRIMARY_IDS = ["inbox", "followups", "contacts"] as const;

export const APP_NAV_AUTOMATION_BASE_ITEM_IDS = [
  "widget",
  "chatbot",
  "automations",
  "templates",
  "aiBrain",
] as const;

export const APP_NAV_SETTINGS_ITEM_IDS = ["settings", "integrations"] as const;
export const APP_NAV_SUPPORT_ITEM_IDS = ["gettingStarted", "help"] as const;

export const APP_NAV_LABEL_KEYS: Record<AppNavSectionId | AppNavItemId, string> = {
  main: "nav.main",
  automationAi: "nav.automationAi",
  growthEngines: "nav.growthEngines",
  settingsIntegrations: "nav.settingsIntegrations",
  support: "nav.support",
  inbox: "nav.inbox",
  followups: "nav.followups",
  contacts: "nav.contacts",
  search: "nav.search",
  widget: "nav.widget",
  chatbot: "nav.chatbot",
  automations: "nav.automations",
  campaigns: "nav.campaigns",
  templates: "nav.templates",
  aiBrain: "nav.aiBrain",
  prospectAi: "nav.prospectAi",
  realtorGrowthEngine: "nav.realtorGrowthEngine",
  settings: "nav.settings",
  integrations: "nav.integrations",
  gettingStarted: "nav.gettingStarted",
  help: "nav.help",
};

export const APP_NAV_LABEL_DEFAULTS: Record<AppNavSectionId | AppNavItemId, string> = {
  main: "Main",
  automationAi: "Automation & AI",
  growthEngines: "Growth Engines",
  settingsIntegrations: "Settings & Integrations",
  support: "Support",
  inbox: "Inbox",
  followups: "Follow-ups",
  contacts: "Contacts",
  search: "Search",
  widget: "Website Widget",
  chatbot: "Chatbot",
  automations: "Automations",
  campaigns: "Campaigns",
  templates: "Templates",
  aiBrain: "AI Brain",
  prospectAi: "Prospect AI",
  realtorGrowthEngine: "Realtor Growth Engine",
  settings: "Settings",
  integrations: "Integrations",
  gettingStarted: "Getting Started",
  help: "Help Center",
};

export const APP_NAV_HREFS: Record<AppNavItemId, string> = {
  inbox: "/app/inbox",
  followups: "/app/followups",
  contacts: "/app/contacts",
  search: "/app/search",
  widget: "/app/widget",
  chatbot: "/app/chatbot",
  automations: "/app/workflows",
  campaigns: APP_CAMPAIGNS_PATH,
  templates: "/app/templates",
  aiBrain: "/app/ai-brain",
  prospectAi: "/app/prospect-ai",
  realtorGrowthEngine: RGE_TEMPLATE_DETAIL_PATH,
  settings: "/app/settings",
  integrations: "/app/integrations",
  gettingStarted: "/user-guide",
  help: "/app/help",
};

export const APP_NAV_EXTERNAL_ITEM_IDS = new Set<AppNavItemId>(["gettingStarted"]);

export const APP_NAV_SIDEBAR_TEST_IDS: Record<AppNavItemId, string> = {
  inbox: "sidebar-inbox",
  followups: "sidebar-followups",
  contacts: "sidebar-contacts",
  search: "sidebar-search",
  widget: "sidebar-widget",
  chatbot: "sidebar-chatbot",
  automations: "sidebar-automation",
  campaigns: "sidebar-campaigns",
  templates: "sidebar-templates",
  aiBrain: "sidebar-ai-brain",
  prospectAi: "sidebar-prospect-ai",
  realtorGrowthEngine: "sidebar-realtor-growth-engine",
  settings: "sidebar-settings",
  integrations: "sidebar-integrations",
  gettingStarted: "sidebar-getting-started",
  help: "sidebar-help",
};

export const APP_NAV_MOBILE_TEST_IDS: Record<AppNavItemId, string> = {
  inbox: "inbox",
  followups: "followups",
  contacts: "contacts",
  search: "search",
  widget: "website-widget",
  chatbot: "chatbot",
  automations: "automation",
  campaigns: "campaigns",
  templates: "templates",
  aiBrain: "ai-brain",
  prospectAi: "prospect-ai",
  realtorGrowthEngine: "realtor-growth-engine",
  settings: "settings",
  integrations: "integrations",
  gettingStarted: "getting-started",
  help: "help",
};

export type AppNavVisibilityFlags = {
  hasPresetCampaigns: boolean;
  prospectAiActivated: boolean;
  realtorGrowthEngineActivated: boolean;
};

export type ResolvedAppNavSection = {
  id: AppNavSectionId;
  itemIds: AppNavItemId[];
};

export function resolveAppNavSections(flags: AppNavVisibilityFlags): ResolvedAppNavSection[] {
  const automation: AppNavItemId[] = [
    "widget",
    "chatbot",
    "automations",
    ...(flags.hasPresetCampaigns ? (["campaigns"] as const) : []),
    "templates",
    "aiBrain",
  ];
  const growth: AppNavItemId[] = [
    ...(flags.prospectAiActivated ? (["prospectAi"] as const) : []),
    ...(flags.realtorGrowthEngineActivated ? (["realtorGrowthEngine"] as const) : []),
  ];
  return [
    { id: "main", itemIds: [...APP_NAV_MAIN_ITEM_IDS] },
    { id: "automationAi", itemIds: automation },
    ...(growth.length > 0 ? [{ id: "growthEngines" as const, itemIds: growth }] : []),
    { id: "settingsIntegrations", itemIds: [...APP_NAV_SETTINGS_ITEM_IDS] },
    { id: "support", itemIds: [...APP_NAV_SUPPORT_ITEM_IDS] },
  ];
}

export function flattenAppNavItemIds(sections: ResolvedAppNavSection[]): AppNavItemId[] {
  return sections.flatMap((section) => section.itemIds);
}

export function isAppNavItemActive(itemId: AppNavItemId, location: string): boolean {
  if (APP_NAV_EXTERNAL_ITEM_IDS.has(itemId)) return false;
  const path = location.split("?")[0];
  switch (itemId) {
    case "templates":
      return path === "/app/templates";
    case "campaigns":
      return path === APP_CAMPAIGNS_PATH || path.startsWith(`${APP_CAMPAIGNS_PATH}/`);
    case "inbox":
      return path === "/app/inbox" || path.startsWith("/app/inbox/");
    case "realtorGrowthEngine":
      return path.startsWith("/app/templates/realtor-growth-engine");
    default: {
      const href = APP_NAV_HREFS[itemId];
      return path === href || path.startsWith(`${href}/`);
    }
  }
}

export function presetCampaignHref(id: string, options?: { edit?: boolean }): string {
  const base = `${APP_CAMPAIGNS_PATH}/${encodeURIComponent(id)}`;
  return options?.edit ? `${base}?edit=1` : base;
}

export function parsePresetCampaignEditQuery(search: string): boolean {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(raw).get("edit") === "1";
}

export function campaignIdFromLocation(location: string): string | null {
  const path = location.split("?")[0];
  const prefix = `${APP_CAMPAIGNS_PATH}/`;
  if (!path.startsWith(prefix)) return null;
  const id = decodeURIComponent(path.slice(prefix.length).split("/")[0] || "");
  return id || null;
}

export function isGlobalCampaignsLocation(location: string): boolean {
  const path = location.split("?")[0];
  return path === APP_CAMPAIGNS_PATH || path.startsWith(`${APP_CAMPAIGNS_PATH}/`);
}

/** Canonical persisted preset-campaign statuses. "scheduled" and "archived" are not stored. */
export const PRESET_CAMPAIGN_STATUSES = [
  "draft",
  "active_pending",
  "active",
  "paused",
  "completed",
] as const;

export type PresetCampaignStatus = (typeof PRESET_CAMPAIGN_STATUSES)[number];
