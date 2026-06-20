/**
 * Public agent page gates, slug utilities, profile inheritance, and patch policy.
 * Run: npx tsx tests/public-agent-page.test.ts
 */
import { agentPageSettingsPatchSchema, publicAgentBrowseQuerySchema } from "../shared/agent/agentPageSchema";
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
import { buildPublicAgentPageHtml, renderAgentPageListingCards } from "../shared/agent/publicAgentPageHtml";
import {
  buildAgentPageEmbedIframeHtml,
  normalizeEmbedListingTypeParam,
  parseAgentPageEmbedQuery,
} from "../shared/agent/agentPageEmbed";
import {
  compareAgentPageListings,
  listingMatchesAgentPageBrowseFilters,
  normalizePropertyTypeForFilter,
} from "../shared/agent/publicAgentPageBrowse";
import { computeAgentPageBrowseFilterFunnel } from "../shared/agent/agentPageBrowseDebug";
import { browseQueryToFilters } from "../server/agentPage/agentPageBrowseService";
import {
  buildAgentPageListingFullAddress,
  buildAgentPageListingMetaSummary,
} from "../shared/agent/agentPageListingDisplay";
import { prepareAgentPageSettingsPatch } from "../server/agentPage/agentPageSettingsPatch";
import type { AgentPageSettingsResponse } from "../shared/agent/agentPageSchema";
import {
  parseAgentPageMarketAreas,
  serializeAgentPageMarketAreas,
} from "../client/src/components/agentPage/AgentPageMarketAreaChips";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
    publicWebsite: "",
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    youtubeUrl: "",
    schedulingUrl: "",
    widgetEnabled: true,
    publishedOnAgentPage: 0,
    eligibleToPublish: 0,
    totalSynced: 0,
    mlsEligible: 0,
    hiddenUnpublished: 0,
    workspacePublishEnabled: false,
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

  const enablePage = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageEnabled: true },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () => mockSettings({ agentPageSlug: null, businessProfileDisplayName: "Jane Broker" }),
  );
  assert(enablePage.ok, "enable page patch prepares");
  if (enablePage.ok) {
    assert(enablePage.patch.agentPageEnabled === true, "enable flag preserved");
    assert(Boolean(enablePage.patch.agentPageSlug), "auto slug when enabling page");
  }

  const customBioSeed = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageUseCustomBio: true },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () =>
      mockSettings({
        businessProfileAbout: "Helping buyers since 2010.",
        agentPageBio: null,
      }),
  );
  assert(customBioSeed.ok, "custom bio toggle prepares");
  if (customBioSeed.ok) {
    assert(customBioSeed.patch.agentPageUseCustomBio === true, "custom bio flag on");
    assert(
      customBioSeed.patch.agentPageBio === "Helping buyers since 2010.",
      "empty custom bio seeds from Business Profile about",
    );
  }

  const customBioOff = await prepareAgentPageSettingsPatch(
    userId,
    { agentPageUseCustomBio: false, agentPageBio: "ignored" },
    (body) => agentPageSettingsPatchSchema.safeParse(body),
    async () => current,
  );
  assert(customBioOff.ok, "disable custom bio patch prepares");
  if (customBioOff.ok) {
    assert(customBioOff.patch.agentPageUseCustomBio === false, "custom bio flag off");
    assert(customBioOff.patch.agentPageBio === null, "custom bio cleared when disabled");
  }

  console.log("  patch policy: OK");
}

function testMarketAreaChips() {
  const areas = parseAgentPageMarketAreas("Fort Lauderdale, Pompano Beach; Boca Raton");
  assert(areas.length === 3, "parses comma/semicolon market areas");
  assert(
    serializeAgentPageMarketAreas(["Miami", "Miami", "Fort Lauderdale"]) ===
      "Miami, Fort Lauderdale",
    "serializes unique market areas",
  );
  console.log("  market area chips: OK");
}

function testAgentPageDbSavePath() {
  const source = readFileSync(
    join(process.cwd(), "server", "agentPage", "agentPageDb.ts"),
    "utf8",
  );
  assert(!source.includes("onConflictDoUpdate"), "agent page save must not use invalid ON CONFLICT");
  assert(source.includes(".update(aiBusinessKnowledge)"), "agent page save updates existing row");
  assert(source.includes("agentPageUseCustomBio"), "custom bio column wired");
  assert(source.includes("agentPageBio"), "bio column wired");
  assert(source.includes("agentPageEnabled"), "enabled column wired");

  const routes = readFileSync(
    join(process.cwd(), "server", "routes", "agentPageSettings.ts"),
    "utf8",
  );
  assert(
    routes.includes('error: "Failed to update agent page settings"'),
    "PATCH route returns generic error message",
  );
  assert(
    !routes.includes("error: message ||"),
    "PATCH route must not leak raw SQL error message",
  );

  const card = readFileSync(
    join(process.cwd(), "client", "src", "components", "agentPage", "PublicAgentPageSettingsCard.tsx"),
    "utf8",
  );
  assert(card.includes("agentPageEnabled: checked"), "enable page toggle saves");
  assert(card.includes("agentPageUseCustomBio: true"), "custom bio toggle saves");
  assert(
    card.includes("Add an about blurb in Business Profile"),
    "inline validation when custom bio cannot be seeded",
  );
  assert(card.includes("Create a public profile page to capture seller and buyer leads"), "header description");
  assert(card.includes("Agent Page Active"), "active status label");
  assert(card.includes("Edit Business Profile"), "business profile link");
  assert(card.includes("Managed in Business Profile"), "business profile managed label");
  assert(card.includes("AgentPageMarketAreaChips"), "market area chips component");
  assert(!card.includes("agent-page-future-analytics"), "no future analytics placeholder");
  assert(!card.includes("Lead capture analytics"), "no analytics placeholder cards");
  assert(card.includes("agent-page-url-block"), "agent url block");
  assert(card.includes("agent-page-embed-code"), "embed code block");
  assert(card.includes("buildAgentPageEmbedIframeHtml"), "embed iframe helper");
  assert(card.includes('listingType: "for_sale"'), "for sale embed param in snippet builder");
  assert(card.includes('listingType: "for_rent"'), "for rent embed param in snippet builder");
  assert(card.includes("Primary contact button"), "primary contact button label");
  assert(card.includes("agent-page-primary-contact-button"), "primary contact button test id");
  assert(card.includes("Email link"), "email link option label");
  assert(card.includes("Phone call"), "phone call option label");
  assert(
    card.includes("Web chat and forms create CRM leads in your Inbox"),
    "primary contact helper text",
  );
  assert(card.includes("agent-page-social-links"), "social links settings block");
  assert(card.includes("Website URL"), "website url field");
  assert(card.includes("Facebook URL"), "facebook url field");
  assert(card.includes("Instagram URL"), "instagram url field");
  assert(card.includes("LinkedIn URL"), "linkedin url field");
  assert(card.includes("YouTube URL"), "youtube url field");

  const rge = readFileSync(
    join(process.cwd(), "client", "src", "pages", "RealtorGrowthEngine.tsx"),
    "utf8",
  );
  const agentRoute = readFileSync(
    join(process.cwd(), "server", "routes", "publicAgentPage.ts"),
    "utf8",
  );
  assert(agentRoute.includes('from "../urlOrigins"'), "agent page route imports urlOrigins");
  assert(agentRoute.includes("getRequestOrigin"), "agent page route uses getRequestOrigin");
  assert(
    rge.includes("Listings available on your public Agent Page come from connected inventory sources"),
    "inventory helper text below agent page",
  );
  assert(rge.includes("AgentPageSidebarSummary"), "sidebar shows compact agent page summary only");
  assert(rge.includes("InventorySidebarSummary"), "sidebar shows compact inventory summary only");
  assert(rge.includes('data-testid="rge-dashboard-top-grid"'), "top grid wrapper");
  assert(rge.includes('data-testid="rge-dashboard-main"'), "main column stacks automations and agent page");
  assert(rge.includes('data-testid="rge-dashboard-sidebar"'), "sidebar aside wrapper");
  assert(rge.includes('data-testid="rge-agent-page-section"'), "agent page section in main column");
  assert(rge.includes('data-testid="rge-inventory-section"'), "full-width inventory section");

  const sidebarBlock = rge.slice(rge.indexOf('data-testid="rge-dashboard-sidebar"'));
  const sidebarEnd = sidebarBlock.indexOf("</aside>");
  assert(sidebarEnd > 0, "sidebar aside closes");
  const sidebarOnly = sidebarBlock.slice(0, sidebarEnd);
  assert(!sidebarOnly.includes("<PublicAgentPageSettingsCard"), "agent page settings not inside sidebar");
  assert(!sidebarOnly.includes("<InventorySourcesSection"), "inventory settings not inside sidebar");

  const mainBlock = rge.slice(rge.indexOf('data-testid="rge-dashboard-main"'));
  const mainEnd = mainBlock.indexOf('data-testid="rge-dashboard-sidebar"');
  assert(mainEnd > 0, "main column before sidebar");
  const mainOnly = mainBlock.slice(0, mainEnd);
  assert(mainOnly.includes("Active Automations"), "automations in main column");
  assert(mainOnly.includes("<PublicAgentPageSettingsCard"), "agent page under automations in main column");
  assert(
    mainOnly.indexOf("Active Automations") < mainOnly.indexOf("<PublicAgentPageSettingsCard"),
    "agent page below automations",
  );

  const inventorySection = rge.slice(rge.indexOf('data-testid="rge-inventory-section"'));
  assert(inventorySection.includes("<InventorySourcesSection"), "inventory in full-width section below grid");

  console.log("  save path wiring: OK");
}

function testBrowseFilters() {
  const base = {
    status: "Active",
    listingLabel: "FOR SALE" as const,
    cityState: "Tampa, FL",
    priceCents: 45_000_000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    propertyType: "house",
    propertySubtype: null,
    sortIndex: 0,
  };
  assert(
    listingMatchesAgentPageBrowseFilters(base, {
      listingType: "sale",
      location: "tampa",
      minPrice: 400_000,
      maxPrice: 500_000,
      minBeds: 3,
      minBaths: 2,
      minSqft: 1500,
      propertyType: "house",
      sort: "newest",
    }),
    "matches browse filters (filter dollars vs stored cents)",
  );
  assert(
    !listingMatchesAgentPageBrowseFilters(base, {
      listingType: "sale",
      location: "orlando",
      minPrice: null,
      maxPrice: null,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: null,
      sort: "newest",
    }),
    "location filter excludes non-matching city",
  );
  assert(
    !listingMatchesAgentPageBrowseFilters(base, {
      listingType: "rent",
      location: null,
      minPrice: null,
      maxPrice: null,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: null,
      sort: "newest",
    }),
    "sale listing excluded from rent filter",
  );

  const rental = {
    status: "Active",
    listingLabel: "FOR RENT" as const,
    cityState: "Miami, FL",
    priceCents: 3_500_00,
    beds: 2,
    baths: 1,
    sqft: 900,
    propertyType: "condo",
    propertySubtype: null,
    sortIndex: 1,
  };
  assert(
    listingMatchesAgentPageBrowseFilters(rental, {
      listingType: "rent",
      location: null,
      minPrice: null,
      maxPrice: 7000,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: null,
      sort: "newest",
    }),
    "rental matches rent + max price $7000 (uses list/rent priceCents)",
  );
  assert(
    !listingMatchesAgentPageBrowseFilters(rental, {
      listingType: "rent",
      location: null,
      minPrice: null,
      maxPrice: 3000,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: null,
      sort: "newest",
    }),
    "rental excluded when max price below monthly rent",
  );

  const rentalHouse = {
    status: "Active",
    listingLabel: "FOR RENT" as const,
    cityState: "Pompano Beach, FL",
    priceCents: 350_000,
    beds: 3,
    baths: 2,
    sqft: 1400,
    propertyType: "Residential Lease",
    propertySubtype: "Single Family Residence",
    sortIndex: 2,
  };
  assert(
    normalizePropertyTypeForFilter(rentalHouse.propertyType, rentalHouse.propertySubtype) === "house",
    "residential lease SFR maps to house bucket",
  );
  assert(
    listingMatchesAgentPageBrowseFilters(rentalHouse, {
      listingType: "rent",
      location: null,
      minPrice: null,
      maxPrice: 7777,
      minBeds: null,
      minBaths: null,
      minSqft: null,
      propertyType: "house",
      sort: "newest",
    }),
    "SFR rental lease matches rent + house filter",
  );

  assert(
    compareAgentPageListings(
      { ...base, priceCents: 100, sortIndex: 1 },
      { ...base, priceCents: 200, sortIndex: 0 },
      "price_desc",
    ) > 0,
    "price desc sort",
  );
  console.log("  browse filters: OK");
}

function testBrowseFilterFunnel() {
  const listings = [
    {
      id: "sale1",
      shareUrl: "https://example.com/l/sale1",
      imageUrl: null,
      street: null,
      fullAddress: "Tampa, FL",
      metaSummary: "$450,000 • 3 bed • 2 bath • 1,800 Sq Ft",
      cityState: "Tampa, FL",
      price: "$450,000",
      priceCents: 45_000_000,
      beds: "3 bed",
      baths: "2 bath",
      sqft: "1,800 Sq Ft",
      bedsNum: 3,
      bathsNum: 2,
      sqftNum: 1800,
      propertyType: "house",
      propertySubtype: null,
      status: "Active" as const,
      listingLabel: "FOR SALE" as const,
    },
    {
      id: "rent1",
      shareUrl: "https://example.com/l/rent1",
      imageUrl: null,
      street: null,
      fullAddress: "Miami, FL",
      metaSummary: "$3,500/mo • 2 bed • 1 bath • 900 Sq Ft",
      cityState: "Miami, FL",
      price: "$3,500/mo",
      priceCents: 350_000,
      beds: "2 bed",
      baths: "1 bath",
      sqft: "900 Sq Ft",
      bedsNum: 2,
      bathsNum: 1,
      sqftNum: 900,
      propertyType: "condo",
      propertySubtype: null,
      status: "Active" as const,
      listingLabel: "FOR RENT" as const,
    },
    {
      id: "rent2",
      shareUrl: "https://example.com/l/rent2",
      imageUrl: null,
      street: null,
      fullAddress: "Orlando, FL",
      metaSummary: "$8,500/mo • 4 bed • 3 bath • 2,200 Sq Ft",
      cityState: "Orlando, FL",
      price: "$8,500/mo",
      priceCents: 850_000,
      beds: "4 bed",
      baths: "3 bath",
      sqft: "2,200 Sq Ft",
      bedsNum: 4,
      bathsNum: 3,
      sqftNum: 2200,
      propertyType: "house",
      propertySubtype: null,
      status: "Active" as const,
      listingLabel: "FOR RENT" as const,
    },
  ];

  const funnel = computeAgentPageBrowseFilterFunnel(listings, {
    listingType: "rent",
    location: null,
    minPrice: null,
    maxPrice: 7000,
    minBeds: null,
    minBaths: null,
    minSqft: null,
    propertyType: null,
    sort: "newest",
  });

  assert(funnel.publishedCount === 3, "funnel published count");
  assert(funnel.rentalCount === 2, "funnel rental count");
  assert(funnel.afterListingType === 2, "funnel after rent type");
  assert(funnel.afterMaxPrice === 1, "funnel after max $7000 excludes $8500 rent");
  assert(funnel.finalCount === 1, "funnel final rent under $7000");
  console.log("  browse filter funnel: OK");
}

function testListingDisplayHelpers() {
  assert(
    buildAgentPageListingFullAddress({
      street: "2747 NE 15th Street #2747",
      city: "Pompano Beach",
      state: "FL",
      zip: "33062",
    }) === "2747 NE 15th Street #2747, Pompano Beach, FL 33062",
    "full address with street and zip",
  );
  assert(
    buildAgentPageListingMetaSummary({
      price: "$2,300/mo",
      beds: "2 bed",
      baths: "2 bath",
      sqft: "1,008 Sq Ft",
    }) === "$2,300/mo • 2 bed • 2 bath • 1,008 Sq Ft",
    "meta summary joins price and specs",
  );
  console.log("  listing display helpers: OK");
}

function testBrowseQuerySchema() {
  const parsed = publicAgentBrowseQuerySchema.safeParse({
    listingType: "rent",
    maxPrice: "7777",
    propertyType: "house",
    offset: "0",
    limit: "24",
  });
  assert(parsed.success, "browse query parses");
  if (parsed.success) {
    const filters = browseQueryToFilters(parsed.data);
    assert(filters.listingType === "rent", "listing type");
    assert(filters.maxPrice === 7777, "max price");
    assert(filters.propertyType === "house", "property type");
  }
  const saleAlias = publicAgentBrowseQuerySchema.safeParse({ listingType: "for_sale" });
  assert(saleAlias.success && saleAlias.data.listingType === "sale", "for_sale browse alias");
  const rentAlias = publicAgentBrowseQuerySchema.safeParse({ listingType: "for_rent" });
  assert(rentAlias.success && rentAlias.data.listingType === "rent", "for_rent browse alias");
  const cards = renderAgentPageListingCards([
    {
      id: "l1",
      shareUrl: "https://example.com/l1",
      imageUrl: null,
      street: "1 Main",
      fullAddress: "1 Main, Tampa, FL",
      metaSummary: "$500,000",
      cityState: "Tampa, FL",
      price: "$500,000",
      priceCents: 50000000,
      beds: "3 bed",
      baths: "2 bath",
      sqft: "1,800 Sq Ft",
      bedsNum: 3,
      bathsNum: 2,
      sqftNum: 1800,
      propertyType: "house",
      propertySubtype: null,
      status: "Active",
      listingLabel: "FOR SALE",
    },
  ]);
  assert(cards.includes("listing-card"), "render listing cards html");
  console.log("  browse query: OK");
}

function testEmbedMode() {
  assert(parseAgentPageEmbedQuery({ embed: "1", listingType: "for_sale" }).embedMode, "embed=1");
  assert(
    parseAgentPageEmbedQuery({ embed: "1", listingType: "for_sale" }).initialListingType === "sale",
    "for_sale maps to sale chip",
  );
  assert(
    parseAgentPageEmbedQuery({ embed: "1", listingType: "for_rent" }).initialListingType === "rent",
    "for_rent maps to rent chip",
  );
  assert(
    parseAgentPageEmbedQuery({ embed: "1", hideChat: "1" }).hideChat,
    "hideChat=1 with embed",
  );
  assert(
    !parseAgentPageEmbedQuery({ hideChat: "1" }).hideChat,
    "hideChat ignored without embed",
  );
  assert(normalizeEmbedListingTypeParam("for_sale") === "sale", "normalize for_sale");
  const snippet = buildAgentPageEmbedIframeHtml({
    slug: "yaniv-test",
    appOrigin: "https://app.whachatcrm.com",
    listingType: "for_sale",
    title: "Homes for Sale",
  });
  assert(snippet.includes("?embed=1&listingType=for_sale"), "embed iframe sale url");
  assert(snippet.includes("hideChat=1"), "embed iframe src hides chat by default");
  assert(snippet.includes('title="Homes for Sale"'), "embed iframe title");

  const embedHtml = buildPublicAgentPageHtml({
    userId: "u1",
    agentPageSlug: "embed-agent",
    displayName: "Embed Agent",
    bio: "Bio hidden in embed",
    marketArea: "",
    brokerageName: "",
    avatarUrl: null,
    companyLogo: null,
    socialLinks: {
      websiteUrl: "",
      facebookUrl: "",
      instagramUrl: "",
      linkedinUrl: "",
      youtubeUrl: "",
    },
    publicEmail: "",
    publicPhone: "",
    schedulingUrl: "",
    widgetEnabled: true,
    preferredLeadCapture: "webchat",
    showHomeValueCta: true,
    listings: [],
    browseTotal: 0,
    browseHasMore: false,
    browsePageSize: 24,
    embedMode: true,
    initialListingType: "sale",
  });
  assert(embedHtml.includes('body class="embed-mode"'), "embed body class");
  assert(!embedHtml.includes('<header class="agent-header"'), "no profile header in embed");
  assert(!embedHtml.includes("Bio hidden in embed"), "profile bio not rendered in embed");
  assert(embedHtml.includes('"embedMode":true'), "embed config flag");
  assert(embedHtml.includes('"initialListingType":"sale"'), "initial listing type in config");
  assert(embedHtml.includes("Embedded Agent Page listing card"), "embed listing lead source");
  assert(embedHtml.includes("agent_page_embed"), "embed chat widget source");
  assert(embedHtml.includes('data-filter="sale"'), "sale filter chip");
  assert(embedHtml.includes('class="chat-widget enabled"'), "embed chat visible by default");
  assert(embedHtml.includes("chat-bubble"), "embed chat bubble present by default");

  const embedHideChatHtml = buildPublicAgentPageHtml({
    userId: "u1",
    agentPageSlug: "embed-agent",
    displayName: "Embed Agent",
    bio: "",
    marketArea: "",
    brokerageName: "",
    avatarUrl: null,
    companyLogo: null,
    socialLinks: {
      websiteUrl: "",
      facebookUrl: "",
      instagramUrl: "",
      linkedinUrl: "",
      youtubeUrl: "",
    },
    publicEmail: "",
    publicPhone: "",
    schedulingUrl: "",
    widgetEnabled: true,
    preferredLeadCapture: "webchat",
    showHomeValueCta: false,
    listings: [],
    browseTotal: 0,
    browseHasMore: false,
    browsePageSize: 24,
    embedMode: true,
    hideChat: true,
    initialListingType: "rent",
  });
  assert(embedHideChatHtml.includes('body class="embed-mode hide-chat"'), "hide-chat body class");
  assert(embedHideChatHtml.includes('"hideChat":true'), "hideChat config flag");
  assert(!embedHideChatHtml.includes('id="chat-widget"'), "chat widget omitted when hideChat");
  assert(!embedHideChatHtml.includes('id="chat-bubble"'), "chat bubble omitted when hideChat");
  assert(!embedHideChatHtml.includes("chat-bubble-label"), "no Let's Chat bubble label when hideChat");
  assert(
    embedHideChatHtml.includes("body.embed-mode.hide-chat .chat-bubble"),
    "hide-chat css fallback for chat bubble",
  );
  assert(embedHideChatHtml.includes('id="lead-form"'), "lead form preserved in hideChat embed");
  assert(embedHideChatHtml.includes("config.hideChat"), "openChatWidget hideChat fallback");

  const normalHideChatHtml = buildPublicAgentPageHtml({
    userId: "u1",
    agentPageSlug: "normal-agent",
    displayName: "Normal Agent",
    bio: "",
    marketArea: "",
    brokerageName: "",
    avatarUrl: null,
    companyLogo: null,
    socialLinks: {
      websiteUrl: "",
      facebookUrl: "",
      instagramUrl: "",
      linkedinUrl: "",
      youtubeUrl: "",
    },
    publicEmail: "",
    publicPhone: "",
    schedulingUrl: "",
    widgetEnabled: true,
    preferredLeadCapture: "webchat",
    showHomeValueCta: false,
    listings: [],
    browseTotal: 0,
    browseHasMore: false,
    browsePageSize: 24,
    hideChat: true,
  });
  assert(normalHideChatHtml.includes('class="chat-widget enabled"'), "normal page chat unchanged when hideChat without embed");
  assert(!/body class="[^"]*hide-chat/.test(normalHideChatHtml), "no hide-chat body class on normal page");
  console.log("  embed mode: OK");
}

function testSocialUrlPatch() {
  const parsed = agentPageSettingsPatchSchema.safeParse({
    publicWebsite: "https://example.com",
    facebookUrl: "https://facebook.com/agent",
    instagramUrl: "",
    linkedinUrl: null,
  });
  assert(parsed.success, "social url patch validates");
  const bad = agentPageSettingsPatchSchema.safeParse({ facebookUrl: "not-a-url" });
  assert(!bad.success, "invalid social url rejected");
  console.log("  social url patch: OK");
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
    socialLinks: {
      websiteUrl: "https://example.com",
      facebookUrl: "https://facebook.com/testagent",
      instagramUrl: "",
      linkedinUrl: "https://linkedin.com/in/testagent",
      youtubeUrl: "",
    },
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
      fullAddress: "1 Main St, Tampa, FL",
      metaSummary: "$500,000 • 3 bed • 2 bath • 1,800 Sq Ft",
      cityState: "Tampa, FL",
      price: "$500,000",
      priceCents: 50000000,
      beds: "3 bed",
      baths: "2 bath",
      sqft: "1,800 Sq Ft",
      bedsNum: 3,
      bathsNum: 2,
      sqftNum: 1800,
      propertyType: "house",
      propertySubtype: null,
      status: "Active",
      listingLabel: "FOR SALE",
    }],
    browseTotal: 1,
    browseHasMore: false,
    browsePageSize: 24,
  });
  assert(html.includes("Test Agent"), "name in html");
  assert(html.includes("agent-profile-col"), "profile column layout");
  assert(html.includes("agent-brokerage-block"), "brokerage under avatar");
  assert(!html.includes("agent-brokerage-name"), "brokerage name not shown under avatar");
  assert(!html.includes('class="agent-brokerage"'), "brokerage not duplicated in info column");
  assert(html.includes("agent-market-chips"), "market area chips");
  assert(html.includes("market-chip"), "market area chip spacing");
  assert(html.includes("browse-panel-advanced"), "advanced filters single row");
  assert(!html.includes("browse-filter-debug"), "no browse debug panel on public page");
  assert(!html.includes("[REMOVEME]"), "no REMOVEME debug blocks");
  assert(!html.includes('id="browse-debug"'), "no SSR browse debug json");
  assert(html.includes("fetchBrowseListings"), "server-side browse fetch");
  assert(html.includes("btn-browse-load-more"), "load more button");
  assert(html.includes("Load 24 more listings"), "load more copy uses page size");
  assert(html.includes("browse-results-count"), "results count near filters");
  assert(html.includes("1 listing found"), "results summary when all loaded");
  assert(html.includes("browse-back-to-top"), "back to top link");
  assert(html.includes("browse-remaining-count"), "remaining count element");
  assert(html.includes("whachat-logo-mark"), "footer WhachatCRM logo mark");
  assert(html.includes("site-footer-brand"), "footer branding row");
  assert(html.includes(">Powered by</span>"), "footer powered by prefix");
  assert(html.includes(">WhachatCRM</span>"), "footer WhachatCRM name after logo");
  assert(html.includes(".chat-widget.enabled .chat-bubble { pointer-events: auto; }"), "floating chat bubble clickable");
  assert(html.includes("/listings?"), "browse listings API path");
  assert(html.includes("Max price ($)"), "max price labeled in dollars");
  assert(html.includes("agent-social"), "social links row");
  assert(html.includes('aria-label="Website"'), "website icon first when url set");
  assert(html.includes('aria-label="Facebook"'), "facebook icon when url set");
  assert(html.includes('aria-label="LinkedIn"'), "linkedin icon when url set");
  assert(!html.includes('aria-label="Instagram"'), "instagram hidden without url");
  assert(!html.includes('aria-label="YouTube"'), "youtube hidden without url");

  const emptyLinksHtml = buildPublicAgentPageHtml({
    userId: "u2",
    agentPageSlug: "empty-links",
    displayName: "Empty Links Agent",
    bio: "",
    marketArea: "",
    brokerageName: "",
    avatarUrl: null,
    companyLogo: null,
    socialLinks: {
      websiteUrl: "",
      facebookUrl: "",
      instagramUrl: "",
      linkedinUrl: "",
      youtubeUrl: "",
    },
    publicEmail: "",
    publicPhone: "",
    schedulingUrl: "",
    widgetEnabled: false,
    preferredLeadCapture: "webchat",
    showHomeValueCta: false,
    listings: [],
    browseTotal: 0,
    browseHasMore: false,
    browsePageSize: 24,
  });
  assert(!emptyLinksHtml.includes('class="agent-social"'), "no social row when all links empty");
  assert(!emptyLinksHtml.includes('class="agent-social-link"'), "no social icon anchors when all links empty");
  assert(html.includes("width: 120px"), "larger desktop avatar");
  assert(html.includes('target="_blank" rel="noopener noreferrer"'), "listing links open in new tab");
  assert(html.includes('data-action="share"'), "share button on listing card");
  assert(html.includes("shareListing"), "web share with clipboard fallback");
  assert(html.includes("modal-listing-context"), "listing context in lead modal");
  assert(html.includes("Let's Chat"), "web chat primary button label");
  assert(html.includes("chat-widget"), "docked chat widget");
  assert(html.includes("chat-bubble"), "floating chat bubble");
  assert(html.includes("chat-bubble-label"), "floating chat CTA label");
  assert(html.includes('class="chat-widget enabled"'), "chat enabled when widget on");
  assert(html.includes("chat-minimize"), "chat minimize button");
  assert(html.includes("widget-frame"), "widget iframe embed");
  assert(html.includes("CHAT_WIDGET_SOURCE"), "chat widget source variable");
  assert(html.includes("agent_page_embed"), "embed chat source supported");
  assert(html.includes("filter-min-price"), "price filters in panel");
  assert(!html.includes("browse-basic-row"), "no always-visible price row");
  assert(!html.includes("section-title"), "no listings heading");
  assert(!html.includes(">Listings<"), "listings title removed");
  assert(html.includes("filter-location"), "location filter");
  assert(html.includes("listings-section"), "listings section wrapper");
  assert(html.includes("btn-toggle-filters"), "collapsible filters toggle");
  assert(html.includes("More Filters"), "desktop more filters label");
  assert(html.includes("browse-panel"), "advanced filters panel");
  assert(html.includes('browse-panel" id="browse-panel" hidden'), "filters panel hidden by default");
  assert(html.includes("filter-sort"), "sort control");
  assert(html.includes("data-filter=\"sale\""), "listing type filters");
  assert(html.includes("What's My Home Worth?"), "home worth cta");
  assert(html.includes("Thinking of Selling?"), "home worth modal title");
  assert(html.includes("Get a free home valuation and personalized selling strategy."), "home worth modal subtitle");
  assert(html.includes('content="noindex, nofollow"'), "noindex");
  console.log("  html: OK");
}

async function main() {
  console.log("public-agent-page tests");
  testGate();
  testSlug();
  testProfileInheritance();
  await testPatchPolicy();
  testMarketAreaChips();
  testAgentPageDbSavePath();
  testBrowseFilters();
  testBrowseFilterFunnel();
  testListingDisplayHelpers();
  testBrowseQuerySchema();
  testSocialUrlPatch();
  testEmbedMode();
  testHtml();
  console.log("\nAll tests passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
