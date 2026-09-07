import {
  Inbox,
  ListTodo,
  Users,
  Search,
  Globe,
  Bot,
  Zap,
  Megaphone,
  FileText,
  Brain,
  Sparkles,
  Home,
  Settings,
  Plug,
  BookOpen,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  APP_NAV_EXTERNAL_ITEM_IDS,
  APP_NAV_HREFS,
  APP_NAV_LABEL_DEFAULTS,
  APP_NAV_LABEL_KEYS,
  APP_NAV_MOBILE_PRIMARY_IDS,
  APP_NAV_MOBILE_TEST_IDS,
  APP_NAV_SIDEBAR_TEST_IDS,
  PRESET_CAMPAIGNS_API,
  flattenAppNavItemIds,
  isAppNavItemActive,
  campaignIdFromLocation,
  resolveAppNavSections,
  type AppNavItemId,
  type AppNavSectionId,
} from "@shared/appNav";
import {
  getRgeHubPath,
  isRgeOwnedStatus,
  type RgeEntitlementStatus,
} from "@shared/rgePaths";
import { PROSPECT_AI_PATH, useProspectAiStatus } from "@/lib/prospectAi";
import { useHideGrowthEngineForShopify } from "@/lib/shopifyMerchantExperience";

const APP_NAV_ICONS: Record<AppNavItemId, LucideIcon> = {
  inbox: Inbox,
  followups: ListTodo,
  contacts: Users,
  search: Search,
  widget: Globe,
  chatbot: Bot,
  automations: Zap,
  campaigns: Megaphone,
  templates: FileText,
  aiBrain: Brain,
  prospectAi: Sparkles,
  realtorGrowthEngine: Home,
  settings: Settings,
  integrations: Plug,
  gettingStarted: BookOpen,
  help: HelpCircle,
};

export type AppNavLinkItem = {
  id: AppNavItemId;
  icon: LucideIcon;
  label: string;
  href: string;
  testId: string;
  mobileTestId: string;
  external: boolean;
  active: boolean;
};

export type AppNavCategory = {
  id: AppNavSectionId;
  label: string;
  items: AppNavLinkItem[];
};

type RgeNavPayload = {
  entitlement?: {
    status?: RgeEntitlementStatus;
    purchasedAt?: string | null;
    onboardingSubmittedAt?: string | null;
  };
};

export function useAppNavCategories(): {
  categories: AppNavCategory[];
  allItems: AppNavLinkItem[];
  mobilePrimaryItems: AppNavLinkItem[];
  mobileMoreCategories: AppNavCategory[];
} {
  const { t } = useTranslation();
  const [location] = useLocation();
  const prospectAiStatus = useProspectAiStatus();
  const prospectAiActivated = Boolean(prospectAiStatus.data?.activated);
  const hideRgeForShopify = useHideGrowthEngineForShopify();

  const { data: presetCampaigns } = useQuery<unknown[]>({
    queryKey: [PRESET_CAMPAIGNS_API],
    staleTime: 15_000,
    retry: false,
  });
  const hasPresetCampaigns =
    (Array.isArray(presetCampaigns) && presetCampaigns.length > 0) ||
    Boolean(campaignIdFromLocation(location));

  const { data: rgePayload } = useQuery<RgeNavPayload | null>({
    queryKey: ["/api/templates/realtor-growth-engine"],
    queryFn: async () => {
      const res = await fetch("/api/templates/realtor-growth-engine", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30_000,
    retry: false,
    enabled: !hideRgeForShopify,
  });
  const realtorGrowthEngineActivated =
    !hideRgeForShopify && isRgeOwnedStatus(rgePayload?.entitlement?.status);

  return useMemo(() => {
    const sections = resolveAppNavSections({
      hasPresetCampaigns,
      prospectAiActivated,
      realtorGrowthEngineActivated,
    });

    const toItem = (id: AppNavItemId): AppNavLinkItem => {
      let href = APP_NAV_HREFS[id];
      if (id === "prospectAi") href = PROSPECT_AI_PATH;
      if (id === "realtorGrowthEngine") {
        href = getRgeHubPath(rgePayload?.entitlement?.status, rgePayload?.entitlement);
      }
      return {
        id,
        icon: APP_NAV_ICONS[id],
        label: t(APP_NAV_LABEL_KEYS[id], APP_NAV_LABEL_DEFAULTS[id]),
        href,
        testId: APP_NAV_SIDEBAR_TEST_IDS[id],
        mobileTestId: APP_NAV_MOBILE_TEST_IDS[id],
        external: APP_NAV_EXTERNAL_ITEM_IDS.has(id),
        active: isAppNavItemActive(id, location),
      };
    };

    const categories: AppNavCategory[] = sections.map((section) => ({
      id: section.id,
      label: t(APP_NAV_LABEL_KEYS[section.id], APP_NAV_LABEL_DEFAULTS[section.id]),
      items: section.itemIds.map(toItem),
    }));

    const allItems = flattenAppNavItemIds(sections).map(toItem);
    const primaryIdSet = new Set<AppNavItemId>(APP_NAV_MOBILE_PRIMARY_IDS);
    const mobilePrimaryItems = allItems.filter((item) => primaryIdSet.has(item.id));
    const mobileMoreCategories = categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => !primaryIdSet.has(item.id)),
      }))
      .filter((category) => category.items.length > 0);

    return { categories, allItems, mobilePrimaryItems, mobileMoreCategories };
  }, [
    t,
    location,
    hasPresetCampaigns,
    prospectAiActivated,
    realtorGrowthEngineActivated,
    rgePayload,
  ]);
}
