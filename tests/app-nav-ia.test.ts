/**
 * Authenticated nav IA: section order, labels, conditional Campaigns, Growth Engines isolation.
 * Run: npx tsx --test tests/app-nav-ia.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import {
  APP_CAMPAIGNS_PATH,
  APP_NAV_AUTOMATION_BASE_ITEM_IDS,
  APP_NAV_HREFS,
  APP_NAV_LABEL_DEFAULTS,
  APP_NAV_MAIN_ITEM_IDS,
  APP_NAV_SETTINGS_ITEM_IDS,
  APP_NAV_SUPPORT_ITEM_IDS,
  PRESET_CAMPAIGN_STATUSES,
  campaignIdFromLocation,
  flattenAppNavItemIds,
  isAppNavItemActive,
  parsePresetCampaignEditQuery,
  presetCampaignHref,
  resolveAppNavSections,
} from "../shared/appNav";
import { getPresetCampaignStatusLabel } from "../shared/presetCampaignLabels";
import { isRgeOwnedStatus } from "../shared/rgePaths";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const en = JSON.parse(read("client/src/locales/en.json"));
const es = JSON.parse(read("client/src/locales/es.json"));
const he = JSON.parse(read("client/src/locales/he.json"));

test("canonical section names, order, and item placement", () => {
  const empty = resolveAppNavSections({
    hasPresetCampaigns: false,
    prospectAiActivated: false,
    realtorGrowthEngineActivated: false,
  });
  assert.deepEqual(
    empty.map((s) => s.id),
    ["main", "automationAi", "settingsIntegrations", "support"],
  );
  assert.deepEqual(empty[0].itemIds, [...APP_NAV_MAIN_ITEM_IDS]);
  assert.equal(empty[0].itemIds.includes("search"), true);
  assert.deepEqual(empty[1].itemIds, [
    "widget",
    "chatbot",
    "automations",
    "templates",
    "aiBrain",
  ]);
  assert.equal(empty[1].itemIds.includes("campaigns"), false);
  assert.deepEqual(empty[2].itemIds, [...APP_NAV_SETTINGS_ITEM_IDS]);
  assert.deepEqual(empty[3].itemIds, [...APP_NAV_SUPPORT_ITEM_IDS]);

  const withCampaigns = resolveAppNavSections({
    hasPresetCampaigns: true,
    prospectAiActivated: false,
    realtorGrowthEngineActivated: false,
  });
  assert.deepEqual(withCampaigns[1].itemIds, [
    "widget",
    "chatbot",
    "automations",
    "campaigns",
    "templates",
    "aiBrain",
  ]);
  assert.equal(withCampaigns.find((s) => s.id === "growthEngines"), undefined);

  const withEngines = resolveAppNavSections({
    hasPresetCampaigns: true,
    prospectAiActivated: true,
    realtorGrowthEngineActivated: true,
  });
  assert.deepEqual(
    withEngines.map((s) => s.id),
    ["main", "automationAi", "growthEngines", "settingsIntegrations", "support"],
  );
  assert.deepEqual(withEngines[2].itemIds, ["prospectAi", "realtorGrowthEngine"]);
  assert.equal(flattenAppNavItemIds(withEngines).includes("campaigns"), true);
});

test("zero campaigns hides Campaigns; a draft id in the URL reveals it", () => {
  const zero = resolveAppNavSections({
    hasPresetCampaigns: false,
    prospectAiActivated: false,
    realtorGrowthEngineActivated: false,
  });
  assert.equal(flattenAppNavItemIds(zero).includes("campaigns"), false);
  assert.equal(campaignIdFromLocation("/app/campaigns"), null);
  assert.equal(campaignIdFromLocation("/app/campaigns/draft-1?edit=1"), "draft-1");
  assert.equal(parsePresetCampaignEditQuery("?edit=1"), true);
  assert.equal(presetCampaignHref("draft-1", { edit: true }), "/app/campaigns/draft-1?edit=1");
});

test("nav labels: Search under Main, Settings/Integrations grouped, Website Widget and AI Brain", () => {
  assert.equal(APP_NAV_LABEL_DEFAULTS.main, "Main");
  assert.equal(APP_NAV_LABEL_DEFAULTS.automationAi, "Automation & AI");
  assert.equal(APP_NAV_LABEL_DEFAULTS.settingsIntegrations, "Settings & Integrations");
  assert.equal(APP_NAV_LABEL_DEFAULTS.widget, "Website Widget");
  assert.equal(APP_NAV_LABEL_DEFAULTS.aiBrain, "AI Brain");
  assert.equal(APP_NAV_LABEL_DEFAULTS.chatbot, "Chatbot");
  assert.equal(APP_NAV_LABEL_DEFAULTS.help, "Help Center");
  assert.equal(APP_NAV_HREFS.search, "/app/search");
  assert.equal(APP_NAV_HREFS.campaigns, APP_CAMPAIGNS_PATH);
  assert.equal(APP_NAV_HREFS.aiBrain, "/app/ai-brain");
  assert.equal(APP_NAV_MAIN_ITEM_IDS[3], "search");
  assert.deepEqual([...APP_NAV_SETTINGS_ITEM_IDS], ["settings", "integrations"]);
  assert.equal(APP_NAV_AUTOMATION_BASE_ITEM_IDS[0], "widget");
});

test("English, Spanish, and Hebrew nav translations stay aligned", () => {
  for (const loc of [en, es, he]) {
    assert.equal(typeof loc.nav.main, "string");
    assert.equal(typeof loc.nav.automationAi, "string");
    assert.equal(typeof loc.nav.settingsIntegrations, "string");
    assert.equal(typeof loc.nav.growthEngines, "string");
    assert.equal(typeof loc.nav.support, "string");
    assert.equal(typeof loc.nav.search, "string");
    assert.equal(typeof loc.nav.campaigns, "string");
    assert.equal(typeof loc.nav.widget, "string");
    assert.equal(typeof loc.nav.aiBrain, "string");
    assert.equal(typeof loc.nav.gettingStarted, "string");
    assert.equal(typeof loc.nav.prospectAi, "string");
    assert.equal(typeof loc.nav.realtorGrowthEngine, "string");
    assert.equal(typeof loc.common.signedInAs, "string");
  }
  assert.equal(en.nav.widget, "Website Widget");
  assert.equal(en.nav.aiBrain, "AI Brain");
  assert.equal(en.nav.aiFeatures, "AI Brain");
  assert.equal(en.nav.campaigns, "Campaigns");
  assert.equal(en.widgetPage.title, "Website Chat Widget");
  assert.notEqual(es.nav.campaigns, en.nav.campaigns);
  assert.notEqual(he.nav.campaigns, en.nav.campaigns);
  assert.notEqual(es.nav.settingsIntegrations, en.nav.settingsIntegrations);
  assert.notEqual(he.nav.settingsIntegrations, en.nav.settingsIntegrations);
});

test("desktop, collapsed, and mobile consume the shared nav config", () => {
  const sidebar = read("client/src/components/Sidebar.tsx");
  const mobile = read("client/src/components/MobileNav.tsx");
  const hook = read("client/src/lib/useAppNav.ts");
  assert.match(sidebar, /useAppNavCategories/);
  assert.match(sidebar, /hidden md:flex/);
  assert.match(mobile, /useAppNavCategories/);
  assert.match(mobile, /md:hidden/);
  assert.match(mobile, /mobileMoreCategories/);
  assert.match(mobile, /mobilePrimaryItems/);
  assert.match(hook, /resolveAppNavSections/);
  assert.match(sidebar, /LanguageSelector/);
  assert.match(sidebar, /common\.signedInAs/);
  assert.match(mobile, /common\.signedInAs/);
  assert.match(sidebar, /common\.logout/);
  assert.match(mobile, /common\.logout/);
  assert.doesNotMatch(sidebar, /Tools & Setup/);
  assert.doesNotMatch(sidebar, /AI Features/);
  assert.doesNotMatch(sidebar, /Website Chat Widget/);
  assert.doesNotMatch(mobile, /AI Features/);
  assert.doesNotMatch(mobile, /Website Chat Widget/);
});

test("RTL/Hebrew chrome remains wired through dir and i18n", () => {
  const sidebar = read("client/src/components/Sidebar.tsx");
  const mobile = read("client/src/components/MobileNav.tsx");
  const layout = read("client/src/pages/AppLayout.tsx");
  assert.match(sidebar, /getDirection/);
  assert.match(sidebar, /isRTL/);
  assert.match(mobile, /dir=\{isRTL \? "rtl" : "ltr"\}/);
  assert.match(layout, /dir=\{isRTL \? "rtl" : "ltr"\}/);
  assert.equal(he.nav.inbox.length > 0, true);
  assert.equal(he.nav.aiBrain, "AI Brain");
});

test("Use This Template creates a draft and redirects to the campaign editor", () => {
  const selector = read("client/src/components/LocalizedTemplateSelector.tsx");
  const templates = read("client/src/pages/Templates.tsx");
  const campaigns = read("client/src/pages/Campaigns.tsx");
  const layout = read("client/src/pages/AppLayout.tsx");
  assert.match(selector, /launchImmediately:\s*false/);
  assert.match(selector, /"\/api\/preset-campaigns"/);
  assert.match(templates, /presetCampaignHref\(id, \{ edit: true \}\)/);
  assert.doesNotMatch(templates, /Saved Campaigns/);
  assert.doesNotMatch(templates, /openSavedCampaignModal/);
  assert.match(layout, /path="\/app\/campaigns\/:id\?"/);
  assert.match(campaigns, /parsePresetCampaignEditQuery/);
  assert.match(campaigns, /usePresetCampaignWorkspace/);
  assert.doesNotMatch(campaigns, /prospect-outreach/);
  assert.doesNotMatch(campaigns, /\/api\/growth-engines\/prospect-ai/);
});

test("persisted campaign statuses are reused; scheduled and archive are not invented", () => {
  assert.deepEqual([...PRESET_CAMPAIGN_STATUSES], [
    "draft",
    "active_pending",
    "active",
    "paused",
    "completed",
  ]);
  assert.equal(getPresetCampaignStatusLabel("draft"), "Draft");
  assert.equal(getPresetCampaignStatusLabel("active"), "Active");
  assert.equal(getPresetCampaignStatusLabel("paused"), "Paused");
  assert.equal(getPresetCampaignStatusLabel("completed"), "Completed");
  const table = read("client/src/components/SavedPresetCampaignsTable.tsx");
  assert.match(table, /Activate/);
  assert.match(table, /Pause/);
  assert.match(table, /Duplicate/);
  assert.match(table, /Delete/);
  assert.doesNotMatch(table, /Archive/);
  assert.doesNotMatch(table, /Scheduled/);
  const routes = read("server/routes/templates.ts");
  const getBlock = routes.slice(routes.indexOf('app.get("/api/preset-campaigns"'));
  assert.doesNotMatch(getBlock.slice(0, 1200), /status === "active"/);
  assert.match(getBlock.slice(0, 800), /getPresetCampaignsForUser/);
});

test("global Campaigns stay isolated from Prospect AI and Realtor Growth Engine", () => {
  const campaigns = read("client/src/pages/Campaigns.tsx");
  const hook = read("client/src/hooks/usePresetCampaignWorkspace.ts");
  assert.match(hook, /PRESET_CAMPAIGNS_API/);
  assert.doesNotMatch(hook, /prospect-outreach/);
  assert.doesNotMatch(campaigns, /realtor-growth-engine/);
  assert.doesNotMatch(campaigns, /prospect-ai/);
  assert.equal(APP_NAV_HREFS.prospectAi, "/app/prospect-ai");
  assert.equal(APP_NAV_HREFS.realtorGrowthEngine, "/app/templates/realtor-growth-engine");
  assert.notEqual(APP_NAV_HREFS.campaigns, APP_NAV_HREFS.prospectAi);
});

test("active matching keeps Templates and Realtor Growth Engine distinct", () => {
  assert.equal(isAppNavItemActive("templates", "/app/templates"), true);
  assert.equal(isAppNavItemActive("templates", "/app/templates?tab=presets"), true);
  assert.equal(isAppNavItemActive("templates", "/app/templates/realtor-growth-engine"), false);
  assert.equal(isAppNavItemActive("realtorGrowthEngine", "/app/templates/realtor-growth-engine"), true);
  assert.equal(isAppNavItemActive("campaigns", "/app/campaigns"), true);
  assert.equal(isAppNavItemActive("campaigns", "/app/campaigns/abc"), true);
  assert.equal(isAppNavItemActive("search", "/app/search"), true);
});

test("Growth Engine sidebar visibility follows existing activation/owned rules", () => {
  const hook = read("client/src/lib/useAppNav.ts");
  assert.match(hook, /useProspectAiStatus/);
  assert.match(hook, /isRgeOwnedStatus/);
  assert.match(hook, /useHideGrowthEngineForShopify/);
  assert.equal(isRgeOwnedStatus("locked"), false);
  assert.equal(isRgeOwnedStatus("purchased"), true);
  assert.equal(isRgeOwnedStatus("installed"), true);
  const none = resolveAppNavSections({
    hasPresetCampaigns: false,
    prospectAiActivated: false,
    realtorGrowthEngineActivated: false,
  });
  assert.equal(none.some((s) => s.id === "growthEngines"), false);
});

test("Free/Pro and Growth Engine entitlement rules are unchanged", () => {
  const entitlement = read("shared/aiBrainEntitlement.ts");
  const pricing = read("shared/pricingEntitlements.ts");
  const ge = read("server/growthEngineEntitlements.ts");
  assert.match(entitlement, /export function planIncludesAIBrain/);
  assert.match(entitlement, /effectivePlan === "pro"/);
  assert.match(entitlement, /export function growthEngineEligibleForPlan/);
  assert.match(pricing, /planAllowsTemplateCampaigns/);
  assert.match(pricing, /limitsAllowTemplateCampaigns/);
  assert.match(ge, /evaluateGrowthEngineAccess/);
  assert.doesNotMatch(read("client/src/pages/Campaigns.tsx"), /resolveAIBrainAccess/);
  assert.doesNotMatch(read("shared/appNav.ts"), /planIncludesAIBrain/);
});

test("AI Brain naming is used in nav, help, and pricing; page route stays /app/ai-brain", () => {
  assert.equal(en.nav.aiBrain, "AI Brain");
  assert.equal(en.pricingPage.sections.aiFeatures, "AI Brain");
  const help = read("client/src/lib/helpCenterTranslations.ts");
  assert.match(help, /name: "AI Brain"/);
  assert.match(help, /category: "AI Brain"/);
  assert.doesNotMatch(help, /name: "AI Features"/);
  const layout = read("client/src/pages/AppLayout.tsx");
  assert.match(layout, /path="\/app\/ai-brain"/);
  assert.doesNotMatch(layout, /\/app\/ai-features/);
  const inbox = read("client/src/components/InboxLeadDetailsPanel.tsx");
  assert.match(inbox, /Templates, then return via Campaigns/);
  const channels = read("client/src/components/ChannelSettings.tsx");
  assert.match(channels, /label: 'Web Chat'/);
});

test("Inbox channel name Web Chat and widget page title are preserved", () => {
  const website = read("client/src/pages/WebsiteWidget.tsx");
  assert.match(website, /Website Chat Widget/);
  const channels = read("client/src/components/ChannelSettings.tsx");
  assert.match(channels, /label: 'Web Chat'/);
  assert.equal(en.widgetPage.title, "Website Chat Widget");
});
