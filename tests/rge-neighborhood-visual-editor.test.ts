import assert from "node:assert/strict";
import test from "node:test";
import {
  neighborhoodGuidePhotoId, parseNeighborhoodGuideBlocks, serializeNeighborhoodGuideBlocks,
} from "../shared/agent/neighborhoodGuideBlocks";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

const owner = "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44";
const image = "https://images.example.test/media/" + owner +
  "/neighborhood-guide/2e089653-eaa7-4bee-abce-a3f6f4aa99b3.jpg";
const marker = "[[photo:2e089653-eaa7-4bee-abce-a3f6f4aa99b3]]";

test("existing Victoria Park article paragraphs and markdown headings become editable visual blocks", () => {
  const legacy = "A quiet residential neighborhood close to downtown.\n\n## Around the block\n\nThe local parks and waterfront make this a lively place to live.";
  const blocks = parseNeighborhoodGuideBlocks(legacy);
  assert.deepEqual(blocks, [
    { type: "paragraph", text: "A quiet residential neighborhood close to downtown." },
    { type: "heading", text: "Around the block" },
    { type: "paragraph", text: "The local parks and waterfront make this a lively place to live." },
  ]);
  assert.equal(serializeNeighborhoodGuideBlocks(blocks), legacy);
});

test("existing inline photo markers become photo blocks without losing content", () => {
  const legacy = "A first paragraph.\n\n" + marker + "\n\n## Local activities\n\nAnother paragraph.";
  const blocks = parseNeighborhoodGuideBlocks(legacy);
  assert.deepEqual(blocks[1], { type: "photo", id: "2e089653-eaa7-4bee-abce-a3f6f4aa99b3" });
  assert.equal(serializeNeighborhoodGuideBlocks(blocks), legacy);
  assert.equal(neighborhoodGuidePhotoId(image), "2e089653-eaa7-4bee-abce-a3f6f4aa99b3");
  assert.equal(neighborhoodGuidePhotoId("not a URL"), null);
  assert.equal(neighborhoodGuidePhotoId("https://images.example.test/image.svg"), null);
  assert.deepEqual(parseNeighborhoodGuideBlocks(""), []);
});

test("visual editor's photo reference renders an image between two paragraphs including the cover photo", () => {
  const content = serializeNeighborhoodGuideBlocks([
    { type: "paragraph", text: "Paragraph one about the neighborhood." },
    { type: "photo", id: "2e089653-eaa7-4bee-abce-a3f6f4aa99b3" },
    { type: "paragraph", text: "Paragraph two about its parks." },
  ]);
  const html = buildPublicAgentPageHtml({
    userId: owner, agentPageSlug: "jane-agent", displayName: "Jane Agent",
    bio: "Serving local buyers and sellers.", marketArea: "Fort Lauderdale",
    brokerageName: "Summit Realty", avatarUrl: null, companyLogo: null,
    socialLinks: { websiteUrl: "", facebookUrl: "", instagramUrl: "", linkedinUrl: "", youtubeUrl: "" },
    publicPhone: "+19545550100", schedulingUrl: "", widgetEnabled: false,
    preferredLeadCapture: "email", showHomeValueCta: true, listings: [],
    browseTotal: 0, browseHasMore: false, browsePageSize: 24,
    agentPageUrl: "https://app.whachatcrm.com/agents/jane-agent",
    canonicalUrl: "https://app.whachatcrm.com/agents/jane-agent/victoria-park",
    allowSearchIndexing: true,
    neighborhood: {
      name: "Victoria Park", city: "Fort Lauderdale", state: "Florida", slug: "victoria-park",
      parentUrl: "https://app.whachatcrm.com/agents/jane-agent",
      content,
      photos: [{ url: image, alt: "Cover garden & park" }],
    },
  });
  const start = html.indexOf("<p>Paragraph one about the neighborhood.</p>");
  const middle = html.indexOf('class="neighborhood-guide-inline-photo"');
  const end = html.indexOf("<p>Paragraph two about its parks.</p>");
  assert.ok(start > 0 && middle > start && end > middle);
  assert.match(html, /alt="Cover garden &amp; park"/);
  assert.match(html, /class="neighborhood-guide-cover"/);
  assert.doesNotMatch(html, /\[\[photo:/);
});

test("article text and invalid photo markers are never treated as arbitrary HTML", () => {
  const parts = parseNeighborhoodGuideBlocks("This is <script>alert(1)</script>\n\n[[photo:abc]]");
  assert.equal(parts[0].type, "paragraph");
  assert.equal(parts[1].type, "paragraph");
  assert.equal(serializeNeighborhoodGuideBlocks(parts), "This is <script>alert(1)</script>\n\n[[photo:abc]]");
});
