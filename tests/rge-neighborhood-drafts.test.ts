import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EMPTY_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts,
  sameNeighborhoodContent, writeNeighborhoodDrafts,
} from "../client/src/lib/neighborhoodDrafts";

test("unfinished new and existing neighborhood edits round-trip independently by owner", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const owner = neighborhoodDraftKey("agent-a");
  const existing = "0363978d-9770-4f3e-bb6e-a6ac5d992880";
  const draft = { values: { ...EMPTY_NEIGHBORHOOD, name: "New neighborhood" }, baseVersion: null };
  const edit = { values: { ...EMPTY_NEIGHBORHOOD, content: "Unfinished local notes" }, baseVersion: "2026-11-20T12:00:00.000Z" };
  assert.equal(writeNeighborhoodDrafts(storage, owner, { active: existing, entries: { new: draft, [existing]: edit } }), true);
  const restored = readNeighborhoodDrafts(storage, owner);
  assert.deepEqual(restored, { active: existing, entries: { new: draft, [existing]: edit } });
  assert.deepEqual(readNeighborhoodDrafts(storage, neighborhoodDraftKey("agent-b")), { active: null, entries: {} });
  assert.equal(sameNeighborhoodContent(restored.entries[existing].values, edit.values), true);
  assert.equal(sameNeighborhoodContent(restored.entries[existing].values, draft.values), false);
  writeNeighborhoodDrafts(storage, owner, { active: existing, entries: {} });
  assert.deepEqual(readNeighborhoodDrafts(storage, owner), { active: existing, entries: {} });
  writeNeighborhoodDrafts(storage, owner, { active: null, entries: {} });
  assert.equal(storage.getItem(owner), null);
});

test("malformed or oversized drafts are ignored and unavailable storage is reported", () => {
  const key = neighborhoodDraftKey("agent-a");
  const payload = JSON.stringify({
    active: "untrusted",
    entries: {
      new: { values: { ...EMPTY_NEIGHBORHOOD, content: "x".repeat(5001) }, baseVersion: null },
      untrusted: { values: EMPTY_NEIGHBORHOOD, baseVersion: null },
    },
  });
  assert.deepEqual(readNeighborhoodDrafts({ getItem: () => payload }, key), { active: null, entries: {} });
  assert.deepEqual(readNeighborhoodDrafts({ getItem: () => "{" }, key), { active: null, entries: {} });
  assert.equal(writeNeighborhoodDrafts({
    setItem() { throw new Error("Blocked"); },
    removeItem() { throw new Error("Blocked"); },
  }, key, { active: null, entries: {} }), false);
});

test("RGE Agent Page controls use labeled compact icons without changing destinations", () => {
  const ui = readFileSync(join(process.cwd(), "client/src/components/agentPage/NeighborhoodPageSettings.tsx"), "utf8");
  const main = readFileSync(join(process.cwd(), "client/src/components/agentPage/PublicAgentPageSettingsCard.tsx"), "utf8");

  assert(ui.includes('aria-label={item.publicUrl ? "View live neighborhood page" : "Preview neighborhood draft"}'));
  assert(ui.includes("encodeURIComponent(item.id)}/preview"), "draft preview reuses authenticated endpoint");
  assert(ui.includes('aria-label="Copy neighborhood page URL"'), "published rows retain a Copy action");
  assert(ui.includes('aria-label={`Edit ${neighborhoodTitle(item)}`}'), "Edit remains independently accessible");
  assert(ui.includes('<Pencil className="h-4 w-4"'), "neighborhood Edit uses a compact pencil icon");
  assert(main.includes('aria-label="View Agent Page"'), "Agent Page has a direct accessible View action");
  assert(main.includes('aria-label="Copy Agent Page link"'), "Agent Page retains link copying");
  assert(main.includes('href={agentDisplayUrl}'), "Agent Page View opens the existing public URL");
});

test("international neighborhood page drafts keep ISO country without changing legacy US defaults", () => {
  const key = neighborhoodDraftKey("international-agent");
  const saved = { values: { ...EMPTY_NEIGHBORHOOD, name: "נווה צדק", city: "תל אביב", state: "Tel Aviv", country: "IL" }, baseVersion: null };
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  assert.equal(writeNeighborhoodDrafts(storage, key, { active: "new", entries: { new: saved } }), true);
  assert.deepEqual(readNeighborhoodDrafts(storage, key).entries.new.values, saved.values);
  assert.equal(sameNeighborhoodContent(saved.values, { ...saved.values, country: "US" }), false);
  assert.equal(sameNeighborhoodContent({ ...saved.values, country: undefined }, { ...saved.values, country: "US" }), true);
});
