/**
 * Public agent page gates + slug utilities.
 * Run: npx tsx tests/public-agent-page.test.ts
 */
import { canResolvePublicAgentPage } from "../shared/agent/publicAgentPage";
import {
  buildAgentPageSlug,
  buildAgentPagePath,
  normalizeAgentPageSlug,
} from "../shared/agent/agentPageSlug";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

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
  console.log("  slug: OK");
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

function main() {
  console.log("public-agent-page tests");
  testGate();
  testSlug();
  testHtml();
  console.log("\nAll tests passed.");
}

main();
