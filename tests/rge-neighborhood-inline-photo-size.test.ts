import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  neighborhoodGuidePhotoId, parseNeighborhoodGuideBlocks, parseNeighborhoodPhotoMarker,
  removeNeighborhoodPhotoFromArticle, serializeNeighborhoodGuideBlocks,
} from "../shared/agent/neighborhoodGuideBlocks";
import { neighborhoodContentComplete } from "../shared/agent/neighborhoodPages";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";

const owner = "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44";
const id = "2e089653-eaa7-4bee-abce-a3f6f4aa99b3";
const photo = "https://images.example.test/media/" + owner + "/neighborhood-guide/" + id + ".jpg";
const full = "[[photo:" + id + "]]";
const small = "[[photo:" + id + "|55]]";

function renderGuide(content: string, includePhoto = true) {
  return buildPublicAgentPageHtml({
    userId: owner, agentPageSlug: "jane-agent", displayName: "Jane Agent",
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
      content,
      photos: includePhoto ? [
        { url: photo.replace(id, "0f517ee0-66c8-4eeb-b2bd-8540f7aeb843").replace(".jpg", ".png"), alt: "Neighborhood cover" },
        { url: photo, alt: "Tree lined road near the park" },
      ] : [],
    },
  });
}

test("legacy and resized photo references preserve existing drafts", () => {
  assert.deepEqual(parseNeighborhoodPhotoMarker(full), { id, width: 100 });
  assert.deepEqual(parseNeighborhoodPhotoMarker(small), { id, width: 55 });
  assert.equal(parseNeighborhoodPhotoMarker("[[photo:" + id + "|15]]"), null);
  assert.equal(parseNeighborhoodPhotoMarker("[[photo:" + id + "|150]]"), null);
  assert.equal(parseNeighborhoodPhotoMarker("[[photo:" + id + "|57]]"), null);
  assert.equal(parseNeighborhoodPhotoMarker("[[photo:" + id + "|100; color:red]]"), null);
  const prose = "Victoria Park has broad streets and small local parks.";
  const content = prose + "\n\n" + small + "\n\n## Around the block";
  const blocks = parseNeighborhoodGuideBlocks(content);
  assert.deepEqual(blocks[1], { type: "photo", id, width: 55 });
  assert.equal(serializeNeighborhoodGuideBlocks(blocks), content);
  assert.equal(neighborhoodGuidePhotoId(photo), id);
  assert.equal(serializeNeighborhoodGuideBlocks(parseNeighborhoodGuideBlocks(prose + "\n\n" + full)), prose + "\n\n" + full);
});

test("selected image width is carried into published inline photo, not small gallery thumbnail", () => {
  const article = "Intro about neighborhoods.\n\n## Around the block\n\n" + small + "\n\nAfter the image we describe more places.";
  const html = renderGuide(article);
  const position = html.indexOf('class="neighborhood-guide-inline-photo" style="width:55%"');
  assert.ok(position > 0);
  assert.ok(position > html.indexOf("Around the block</h3>"));
  assert.ok(position < html.indexOf('<p dir="auto">After the image'));
  assert.match(html, /src="https:\/\/images\.example\.test.*\.jpg"/);
  assert.doesNotMatch(html, /class="neighborhood-guide-gallery"/);
  assert.doesNotMatch(html, /\[\[photo:/);
  assert.doesNotMatch(html, /content="[^"]*\|55/);
});

test("full-sized inline photo uses article column width and original unsized reference works", () => {
  const html = renderGuide("Local guide paragraph.\n\n" + full + "\n\nAnother paragraph.");
  assert.match(html, /class="neighborhood-guide-inline-photo" style="width:100%"/);
  assert.match(html, /\.neighborhood-guide-inline-photo \{ margin: 26px auto; max-width: 100%; \}/);
  assert.doesNotMatch(html, /class="neighborhood-guide-gallery"/);
});

test("removed photo references are removed for every saved width", () => {
  assert.equal(removeNeighborhoodPhotoFromArticle("Intro\n\n" + small + "\n\nOutro", photo), "Intro\n\nOutro");
  assert.equal(removeNeighborhoodPhotoFromArticle("Intro\n\n" + full, photo), "Intro");
  assert.equal(removeNeighborhoodPhotoFromArticle("Intro\n\n" + small, "invalid"), "Intro\n\n" + small);
  assert.equal(neighborhoodContentComplete("## Parks\n\n" + small), false);
});

test("unknown sized images are not rendered or used as external HTML", () => {
  const html = renderGuide("Overview.\n\n[[photo:ffffffff-ffff-ffff-ffff-ffffffffffff|55]]", false);
  assert.doesNotMatch(html, /\[\[photo:/);
  assert.doesNotMatch(html, /<img[^>]*https:\/\/external/);
});

test("editor opens chooser in the article and adjusts width in-place", () => {
  const ui = readFileSync(join(process.cwd(), "client/src/components/agentPage/NeighborhoodGuideVisualEditor.tsx"), "utf8");
  assert.match(ui, /pickerAnchorRef\.current = anchor/);
  assert.match(ui, /createPortal\(/);
  assert.match(ui, /anchor\.replaceWith\(figure\)/);
  assert.match(ui, /figure\.scrollIntoView/);
  assert.match(ui, /type="range" min=\{40\} max=\{100\} step=\{5\}/);
  assert.match(ui, /dataset\.photoResizeHandle = "true"/);
  assert.match(ui, /onPointerDown=\{startResizeFromHandle\}/);
  assert.match(ui, /syncEditor\(\)/);
});
