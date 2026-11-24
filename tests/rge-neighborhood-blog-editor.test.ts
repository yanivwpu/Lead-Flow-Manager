import assert from "node:assert/strict";
import test from "node:test";
import { neighborhoodContentComplete } from "../shared/agent/neighborhoodPages";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

const introduction = "Victoria Park is a residential neighborhood near downtown Fort Lauderdale, known for its mix of architectural styles, tree-lined streets, and convenient access to restaurants, shops, and parks. Its location near Las Olas Boulevard and Holiday Park makes it appealing for buyers looking for a neighborhood setting close to the city.";

test("a complete introductory paragraph plus section heading can be updated without a misleading disabled Save", () => {
  assert.ok(introduction.length > 240);
  assert.equal(neighborhoodContentComplete(introduction + "\n\n## Around the block"), true);
  assert.equal(neighborhoodContentComplete(introduction), false);
  assert.equal(neighborhoodContentComplete("Short intro.\n\n## Around the block"), false);
  assert.equal(neighborhoodContentComplete("## Around the block\n\n[[photo:ffffffff-ffff-ffff-ffff-ffffffffffff]]"), false);
});

test("public neighborhood article displays safe bold and italic formatting", () => {
  const html = buildPublicAgentPageHtml({
    userId: "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44",
    agentPageSlug: "jane-agent", displayName: "Jane Agent",
    bio: "Serving local buyers and sellers.", marketArea: "Fort Lauderdale",
    brokerageName: "Summit Realty", avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true, listings: [],
    browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    agentPageUrl: "https://app.whachatcrm.com/agents/jane-agent",
    canonicalUrl: "https://app.whachatcrm.com/agents/jane-agent/victoria-park",
    allowSearchIndexing: true,
    neighborhood: {
      name: "Victoria Park", city: "Fort Lauderdale", state: "Florida", slug: "victoria-park",
      parentUrl: "https://app.whachatcrm.com/agents/jane-agent",
      content: "This neighborhood has **tree-lined streets** and *nearby parks* <script>alert(1)</script>.\n\n## Local & useful\n\nOther local insights for buyers.",
      photos: [],
    },
  });
  assert.match(html, /<strong>tree-lined streets<\/strong>/);
  assert.match(html, /<em>nearby parks<\/em>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /<h3 class="neighborhood-guide-subheading">Local &amp; useful<\/h3>/);
});
