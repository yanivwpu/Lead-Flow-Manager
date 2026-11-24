import assert from "node:assert/strict";
import test from "node:test";
import { isOwnedNeighborhoodGuidePhotoUrl, neighborhoodPhotoMarker } from "../shared/agent/neighborhoodPages";
import { buildPublicAgentPageHtml } from "../shared/agent/publicAgentPageHtml";
import {
  EMPTY_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts, sameNeighborhoodContent,
  writeNeighborhoodDrafts,
} from "../client/src/lib/neighborhoodDrafts";

const owner = "e3078bc6-e9a0-4bf3-ad73-b849e1a84a44";
const other = "a2978bc6-e9a0-4bf3-ad73-b849e1a84a44";
const base = "https://images.example.test";
const photo = `${base}/media/${owner}/neighborhood-guide/2e089653-eaa7-4bee-abce-a3f6f4aa99b3.jpg`;

test("gallery URLs must point to the owner’s durable neighborhood-guide storage only", () => {
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo, owner, base), true);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo, other, base), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo + "?token=123", owner, base), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo.replace("neighborhood-guide", "marketing-assets"), owner, base), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo.replace("images.example.test", "evil.test"), owner, base), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl("javascript:alert(1)", owner, base), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo, owner, undefined), false);
  assert.equal(isOwnedNeighborhoodGuidePhotoUrl(photo.replace(".jpg", ".svg"), owner, base), false);
});

test("neighborhood photo edits persist in owner-only local drafts and affect dirty detection", () => {
  const a = { ...EMPTY_NEIGHBORHOOD, name: "Victoria Park" };
  const b = { ...a, photos: [{ url: photo, alt: "Tree-lined residential street in Victoria Park" }] };
  assert.equal(sameNeighborhoodContent(a, b), false);
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => {
    saved.set(key, value);
  }, removeItem: (key: string) => { saved.delete(key); } };
  const key = neighborhoodDraftKey(owner);
  writeNeighborhoodDrafts(storage, key, { active: "new", entries: { new: { values: b, baseVersion: null } } });
  assert.deepEqual(readNeighborhoodDrafts(storage, key).entries.new.values.photos, b.photos);
  assert.deepEqual(readNeighborhoodDrafts(storage, neighborhoodDraftKey(other)).entries, {});
});

test("neighborhood guide renders responsive photo hero/gallery with accessible alt and no invented listing cards", () => {
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
      content: "An agent-authored overview of neighborhood life.\n\nPractical buyer questions and local perspective.",
      photos: [{ url: photo, alt: "Street scene & trees" },
        { url: photo.replace(".jpg", ".png"), alt: "Local park & cafés" }],
    },
  });
  assert.match(html, /class="neighborhood-guide"/);
  assert.match(html, /class="neighborhood-guide-cover"/);
  assert.match(html, /class="neighborhood-gallery-grid"/);
  assert.match(html, /alt="Street scene &amp; trees"/);
  assert.match(html, /Local park &amp; cafés/);
  assert.match(html, /content="index, follow"/);
  assert.match(html, /id="btn-message"/);
  assert.match(html, /class="neighborhood-agent-sidebar" id="agent-contact"/);
  assert.match(html, /<h1 id="local-guide-title">Discover Victoria Park<\/h1>/);
  assert.match(html, /id="btn-message">Contact Agent/);
  assert.match(html, /id="btn-schedule-header">Schedule Showing/);
  assert.match(html, /id="btn-home-worth">What's My Home Worth/);
  assert.doesNotMatch(html, /<header class="agent-header">/);
  assert.doesNotMatch(html, /class="neighborhood-guide-contact"/);
  assert.match(html, /class="neighborhood-guide-editorial"/);
  assert.doesNotMatch(html, /mailto:/);
});


test("inline neighborhood photos use existing owned upload IDs rather than arbitrary HTML", () => {
  const inlinePhoto = photo.replace("2e089653-eaa7-4bee-abce-a3f6f4aa99b3", "a21a8653-eaa7-4bee-abce-a3f6f4aa99b3");
  const marker = neighborhoodPhotoMarker(inlinePhoto);
  assert.equal(marker, "[[photo:a21a8653-eaa7-4bee-abce-a3f6f4aa99b3]]");
  assert.equal(neighborhoodPhotoMarker("not a URL"), null);
  assert.equal(neighborhoodPhotoMarker("https://other.test/image.svg"), null);

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
      content: `A guide to Victoria Park homes and daily life.\n\n${marker}\n\n## Parks\n\nParks and recreation close to downtown.\n\n[[photo:ffffffff-ffff-ffff-ffff-ffffffffffff]]`,
      photos: [{ url: photo, alt: "Cover photo" },
        { url: inlinePhoto, alt: "Neighborhood park & walking trail" }],
    },
  });
  assert.match(html, /class="neighborhood-guide-inline-photo"/);
  assert.match(html, /alt="Neighborhood park &amp; walking trail"/);
  assert.match(html, /<h3 class="neighborhood-guide-subheading">Parks<\/h3>/);
  assert.doesNotMatch(html, /class="neighborhood-guide-gallery"/);
  assert.doesNotMatch(html, /\[\[photo:/);
  assert.ok(html.indexOf("A guide to Victoria Park") < html.indexOf("neighborhood-guide-inline-photo"));
  assert.ok(html.indexOf("neighborhood-guide-inline-photo") < html.indexOf("Parks</h3>"));
});
