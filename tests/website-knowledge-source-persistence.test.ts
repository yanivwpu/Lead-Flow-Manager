/**
 * Track A hotfix — Website Knowledge source persistence.
 * Guards the production data-loss paths: rescans dropping saved sources and the
 * canonical website URL being rewritten by a non-homepage page.
 *
 * Run: npx tsx tests/website-knowledge-source-persistence.test.ts
 */
import assert from "node:assert/strict";
import {
  WEBSITE_KNOWLEDGE_SLOTS,
  applyScanResultsToSources,
  mergeWebsiteKnowledgeSources,
  parseWebsiteKnowledgeSources,
  resolveCanonicalWebsiteUrl,
  sourcesFromLegacyRow,
  type WebsiteKnowledgeSlotKey,
  type WebsiteKnowledgeSourceEntry,
} from "../shared/websiteKnowledgeSources";
import {
  putWebsiteKnowledgeDraft,
  takeWebsiteKnowledgeDraft,
} from "../server/websiteKnowledgeDraftCache";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}

function entry(key: WebsiteKnowledgeSlotKey, url: string): WebsiteKnowledgeSourceEntry {
  const slot = WEBSITE_KNOWLEDGE_SLOTS.find((s) => s.key === key)!;
  return { key, label: slot.label, url, addedAt: "2026-08-01T00:00:00.000Z" };
}

function urlByKey(sources: WebsiteKnowledgeSourceEntry[]): Record<string, string> {
  return Object.fromEntries(sources.map((s) => [s.key, s.url]));
}

/** The Affordable Pompano workspace: homepage, about, guides, businesses. */
const POMPANO_SAVED: WebsiteKnowledgeSourceEntry[] = [
  entry("homepage", "https://affordablepompano.com/"),
  entry("about", "https://affordablepompano.com/about"),
  entry("productServices", "https://affordablepompano.com/guides"),
  entry("faq", "https://affordablepompano.com/businesses"),
];

run("all nine source fields survive a reload round trip", () => {
  const all = WEBSITE_KNOWLEDGE_SLOTS.map((s, i) => entry(s.key, `https://example.com/p${i}`));
  const persisted = JSON.parse(JSON.stringify(all)) as unknown;
  const restored = parseWebsiteKnowledgeSources(persisted);

  assert.equal(restored.length, 9);
  for (const slot of WEBSITE_KNOWLEDGE_SLOTS) {
    const found = restored.find((r) => r.key === slot.key);
    assert.ok(found, `slot ${slot.key} must survive reload`);
    assert.equal(found!.url, all.find((a) => a.key === slot.key)!.url);
  }
});

run("adding Advertising later preserves homepage, about, guides and businesses", () => {
  // The user reopens the form (all saved slots rehydrated) and fills the empty Other slot.
  const incoming: Partial<Record<WebsiteKnowledgeSlotKey, string>> = {
    homepage: "https://affordablepompano.com/",
    about: "https://affordablepompano.com/about",
    productServices: "https://affordablepompano.com/guides",
    faq: "https://affordablepompano.com/businesses",
    other: "https://affordablepompano.com/advertise",
  };
  const merged = mergeWebsiteKnowledgeSources({
    saved: POMPANO_SAVED,
    incoming,
    incomingIsComplete: true,
  });

  const byKey = urlByKey(merged);
  assert.equal(merged.length, 5);
  assert.equal(byKey.homepage, "https://affordablepompano.com/");
  assert.equal(byKey.about, "https://affordablepompano.com/about");
  assert.equal(byKey.productServices, "https://affordablepompano.com/guides");
  assert.equal(byKey.faq, "https://affordablepompano.com/businesses");
  assert.equal(byKey.other, "https://affordablepompano.com/advertise");
});

run("one added source does not remove old source URLs when the client omits them", () => {
  // The exact production regression: a stale client posts only the new URL.
  const merged = mergeWebsiteKnowledgeSources({
    saved: POMPANO_SAVED,
    incoming: { other: "https://affordablepompano.com/advertise" },
    incomingIsComplete: false,
  });

  assert.equal(merged.length, 5);
  const byKey = urlByKey(merged);
  assert.equal(byKey.about, "https://affordablepompano.com/about");
  assert.equal(byKey.productServices, "https://affordablepompano.com/guides");
  assert.equal(byKey.faq, "https://affordablepompano.com/businesses");
});

run("a blank slot only removes a source when the client sent the complete set", () => {
  const kept = mergeWebsiteKnowledgeSources({
    saved: POMPANO_SAVED,
    incoming: { about: "" },
    incomingIsComplete: false,
  });
  assert.equal(kept.length, 4, "legacy client blanks must not delete sources");

  const removed = mergeWebsiteKnowledgeSources({
    saved: POMPANO_SAVED,
    incoming: {
      homepage: "https://affordablepompano.com/",
      about: "",
      productServices: "https://affordablepompano.com/guides",
      faq: "https://affordablepompano.com/businesses",
    },
    incomingIsComplete: true,
  });
  assert.equal(removed.length, 3, "explicit clear on a complete submission removes the source");
  assert.ok(!removed.some((s) => s.key === "about"));
});

run("rescanning a non-homepage page does not change the canonical website URL", () => {
  const advertisingOnly = resolveCanonicalWebsiteUrl([
    { key: "other", status: "scanned", finalUrl: "https://affordablepompano.com/advertise" },
    { key: "homepage", status: "skipped" },
  ]);
  assert.equal(advertisingOnly, null, "only a scanned homepage may set the canonical URL");

  const failedHomepage = resolveCanonicalWebsiteUrl([
    { key: "homepage", status: "failed" },
    { key: "faq", status: "scanned", finalUrl: "https://affordablepompano.com/businesses" },
  ]);
  assert.equal(failedHomepage, null);

  const scannedHomepage = resolveCanonicalWebsiteUrl([
    { key: "homepage", status: "scanned", finalUrl: "https://affordablepompano.com/" },
    { key: "other", status: "scanned", finalUrl: "https://affordablepompano.com/advertise" },
  ]);
  assert.equal(scannedHomepage, "https://affordablepompano.com/");
});

run("a failed scan leaves published knowledge untouched", () => {
  // A failed scan never creates a draft, and save refuses without one, so the
  // stored summary and source list cannot be replaced.
  assert.equal(takeWebsiteKnowledgeDraft("scan-that-never-existed", "user-1"), null);

  const scanId = putWebsiteKnowledgeDraft({
    userId: "user-1",
    url: null,
    summary: "draft summary",
    sourceUrls: ["https://affordablepompano.com/advertise"],
    sources: POMPANO_SAVED,
  });
  assert.equal(takeWebsiteKnowledgeDraft(scanId, "user-2"), null, "drafts are workspace scoped");

  const taken = takeWebsiteKnowledgeDraft(scanId, "user-1");
  assert.ok(taken);
  assert.equal(taken!.url, null, "no homepage scanned means the canonical URL is left alone");
  assert.equal(taken!.sources.length, 4);
  assert.equal(takeWebsiteKnowledgeDraft(scanId, "user-1"), null, "drafts are single use");
});

run("legacy rows recover their homepage instead of resetting to empty", () => {
  const recovered = sourcesFromLegacyRow({
    websiteKnowledgeUrl: "https://affordablepompano.com/",
    websiteKnowledgeUpdatedAt: new Date("2026-07-01T10:00:00.000Z"),
  });
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].key, "homepage");

  const merged = mergeWebsiteKnowledgeSources({
    saved: recovered,
    incoming: { other: "https://affordablepompano.com/advertise" },
    incomingIsComplete: false,
  });
  assert.equal(merged.length, 2, "legacy homepage is scanned alongside the new page");
});

run("duplicate URLs across slots collapse to one source", () => {
  const merged = mergeWebsiteKnowledgeSources({
    saved: [],
    incoming: {
      homepage: "https://affordablepompano.com/",
      about: "HTTPS://AffordablePompano.com#top",
    },
    incomingIsComplete: true,
  });
  assert.equal(merged.length, 1);
  assert.equal(merged[0].key, "homepage");
});

run("scan outcomes attach to sources without dropping unscanned entries", () => {
  const updated = applyScanResultsToSources(POMPANO_SAVED, [
    { key: "homepage", status: "scanned" },
    { key: "about", status: "failed" },
  ]);

  assert.equal(updated.length, 4, "a failed page stays in the source list");
  assert.equal(updated.find((s) => s.key === "homepage")!.lastStatus, "scanned");
  assert.equal(updated.find((s) => s.key === "about")!.lastStatus, "failed");
  assert.equal(updated.find((s) => s.key === "faq")!.lastStatus, undefined);
});

console.log("\nAll website knowledge source persistence tests passed.");
