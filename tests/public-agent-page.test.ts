/**
 * Public agent page gates, slug utilities, profile inheritance, and patch policy.
 * Run: npx tsx tests/public-agent-page.test.ts
 */
import { agentPageSettingsPatchSchema } from "../shared/agent/agentPageSchema";
import {
  agentPageSettingsSaveAlwaysAllowed,
  resolveAgentPageBio,
  resolveAgentPageDisplayName,
} from "../shared/agent/agentPageProfile";
import { canResolvePublicAgentPage } from "../shared/agent/publicAgentPage";
import {
  buildAgentPageSlug,
  buildAgentPagePath,
  normalizeAgentPageSlug,
  validateAgentPageSlugInput,
} from "../shared/agent/agentPageSlug";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import { prepareAgentPageSettingsPatch } from "../server/agentPage/agentPageSettingsPatch";
import type { AgentPageSettingsResponse } from "../shared/agent/agentPageSchema";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function testGate() {
  assert(!canResolvePublicAgentPage({
    publishListingsPublicly: false,
    agentPageEnabled: true,
    agentPageSlug: "jane-doe-abc12345",
  }), "workspace publish off");

  assert(!canResolvePublicAgentPage({
    publishListingsPublicly: true,
    agentPageEnabled: false,
    agentPageSlug: "jane-doe-abc12345",
  }), "page disabled");

  assert(canResolvePublicAgentPage({
    publishListingsPublicly: true,
    agentPageEnabled: true,
    agentPageSlug: "jane-doe-abc12345",
  }), "fully enabled");

  console.log("  gate: OK");
}

function testSlug() {
  const slug = buildAgentPageSlug("Jane Doe", "271c48f9-3515-4682-b391-2fead371593d");
  assert(slug === "jane-doe-271c48f9", `slug got ${slug}`);
  assert(buildAgentPagePath(slug!) === "/agents/jane-doe-271c48f9");
  assert(normalizeAgentPageSlug("  Jane_Doe!! ") === "jane-doe");

  const invalid = validateAgentPageSlugInput("!!");
  assert(!invalid.ok, "empty slug invalid");
  if (!invalid.ok) {
    assert(invalid.error.includes("Slug"), `unexpected error: ${invalid.error}`);
  }

  const valid = validateAgentPageSlugInput("jane-doe-abc12345");
  assert(valid.ok && valid.slug === "jane-doe-abc12345", "valid slug");

  console.log("  slug: OK");
}

function testProfileInheritance() {
  assert(
    resolveAgentPageDisplayName({ displayName: "Jane Broker" }, "Fallback User") === "Jane Broker",
    "display name from business profile",
  );
  assert(
    resolveAgentPageDisplayName({ displayName: null }, "Fallback User") === "Fallback User",
    "display name falls back to user name",
  );

  assert(
    resolveAgentPageBio({
      agentPageUseCustomBio: false,
      agentPageBio: "Old override",
      aboutText: "Business about text",
    }) === "Business about text",
    "default bio inherits Business Profile about",
  );

  assert(
    resolveAgentPageBio({
      agentPageUseCustomBio: true,
      agentPageBio: "Custom page bio",
      aboutText: "Business about text",
    }) === "Custom page bio",
    "custom bio override works",
  );

  console.log("  profile inheritance: OK");
}

function mockSettings(overrides: Partial<AgentPageSettingsResponse>): AgentPageSettingsResponse {
  return {
    agentPageEnabled: false,
    agentPageSlug: null,
    agentPageUseCustomBio: false,
    agentPageBio: null,
    agentPageMarketArea: null,
    agentPagePreferredLeadCapture: "webchat",
    agentPageShowHomeValueCta: true,
    publishListingsPublicly: false,
    publicPageUrl: null,
    analytics: {
      pageViews: 0,
      listingViews: 0,
      askAboutClicks: 0,
      scheduleShowingClicks: 0,
      homeValueClicks: 0,
    },
    businessProfileDisplayName: "Jane Broker",
    businessProfileAbout: "Helping buyers since 2010.",
    resolvedDisplayName: "Jane Broker",
    resolvedBio: "Helping buyers since 2010.",
    resolvedAvatarUrl: null,
    resolvedCompanyLogo: null,
    resolvedBrokerageName: "Premier Realty",
    schedulingUrl: "",
    widgetEnabled: true,
    ...overrides,
  };
}

async function testPatchPolicy() {
  assert(agentPageSettingsSaveAlwaysAllowed() === true, "settings save always allowed");

  const userId = "271c48f9-3515-4682-b391-2fead371593d";
  const current = mockSettings({ publishListingsPublicly: false, agentPageSlug: "jane-doe-271c48f9" });

  const disabled = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageEnabled: false, agentPageMarketArea: "Pompano Beach, FL" },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () => current,
  );
  assert(disabled.ok, "saving disabled agent page works");

  const publishingOff = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageEnabled: true, agentPageMarketArea: "Tampa, FL" },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () => current,
  );
  assert(publishingOff.ok, "saving with workspace publishing off works");

  const badSlug = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageSlug: "!!" },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () => current,
  );
  assert(!badSlug.ok && badSlug.code === "invalid_slug", "invalid slug rejected");
  if (!badSlug.ok) {
    assert(badSlug.error.length > 0, "invalid slug returns clear error");
  }

  console.log("  patch policy: OK");
}

function testHtml() {
  const html = buildPublicAgentPageHtml({
    userId: "u1",
    agentPageSlug: "test-agent",
    displayName: "Test Agent",
    bio: "Helping buyers and sellers.",
    marketArea: "Tampa, FL",
    brokerageName: "Premier Realty",
    avatarUrl: null,
    companyLogo: null,
    publicEmail: "agent@example.com",
    publicPhone: "+15550100",
    schedulingUrl: "https://calendly.com/test",
    widgetEnabled: true,
    preferredLeadCapture: "webchat",
    showHomeValueCta: true,
    listings: [{
      id: "l1",
      shareUrl: "https://example.com/share/listings/l1",
      imageUrl: null,
      street: "1 Main St",
      cityState: "Tampa, FL",
      price: "$500,000",
      beds: "3 bed",
      baths: "2 bath",
      sqft: "1,800 Sq Ft",
      status: "Active",
      listingLabel: "FOR SALE",
    }],
  });
  assert(html.includes("Test Agent"), "name in html");
  assert(html.includes("For Sale") || html.includes("FOR SALE") || html.includes("data-filter=\"sale\""), "filters");
  assert(html.includes("What's My Home Worth?"), "home worth cta");
  assert(html.includes('content="noindex, nofollow"'), "noindex");
  console.log("  html: OK");
}

async function main() {
  console.log("public-agent-page tests");
  testGate();
  testSlug();
  testProfileInheritance();
  await testPatchPolicy();
  testHtml();
  console.log("\nAll tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
