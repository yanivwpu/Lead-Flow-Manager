import assert from "node:assert/strict";
import test from "node:test";
import {
  EMPTY_NEIGHBORHOOD, NEW_NEIGHBORHOOD, neighborhoodDraftKey, readNeighborhoodDrafts,
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
  writeNeighborhoodDrafts(storage, owner, { active: NEW_NEIGHBORHOOD, entries: {} });
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
