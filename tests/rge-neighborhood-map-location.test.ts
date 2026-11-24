import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findNeighborhoodMapLocation } from "../server/agentPage/neighborhoodMapLocation";
import {
  clearNeighborhoodMapSession, neighborhoodMapSessionKey, readNeighborhoodMapSession, writeNeighborhoodMapSession,
} from "../client/src/lib/neighborhoodMapSession";
import {
  EMPTY_NEIGHBORHOOD, mergeNeighborhoodDraftsPreservingActive,
  type NeighborhoodDrafts,
} from "../client/src/lib/neighborhoodDrafts";

const query = { name: "Doctor Phillips", city: "Orlando", state: "Florida", country: "US" };
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

test("Find neighborhood falls back to Google Places geography when Geocoding is denied", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown>; mask?: string }> = [];
  const fetchFn = (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = String(resource);
    if (url.includes("geocode/json")) {
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("address"), "Doctor Phillips, Orlando, Florida, US");
      calls.push({ url: parsed.origin + parsed.pathname });
      return json({ status: "REQUEST_DENIED", error_message: "API not enabled" });
    }
    assert.ok(url.includes("places:searchText"));
    const body = JSON.parse(String(init?.body));
    calls.push({ url, body, mask: String((init?.headers as Record<string, string>)?.["X-Goog-FieldMask"]) });
    assert.equal(body.textQuery, "Doctor Phillips, Orlando, Florida, US");
    assert.equal(body.regionCode, "US");
    return json({ places: [{
      displayName: { text: "Dr. Phillips" }, types: ["neighborhood", "political"],
      formattedAddress: "Dr. Phillips, Florida, USA",
      location: { latitude: 28.446, longitude: -81.491 },
    }] });
  }) as typeof fetch;
  const result = await findNeighborhoodMapLocation(query, "test-key", fetchFn);
  assert.deepEqual(result, {
    location: { latitude: 28.446, longitude: -81.491, precision: "neighborhood" },
    unavailable: false,
  });
  assert.equal(calls.length, 2, "one geocode and one minimal Places query");
  assert.ok(calls[1].mask?.includes("places.location"));
  assert.ok(!calls[1].mask?.includes("nationalPhoneNumber"));
  const route = readFileSync("server/routes/agentNeighborhoodPages.ts", "utf8");
  assert.ok(route.includes("precision: cached.precision"),
    "the cached response must preserve neighborhood vs approximate city status");
});

test("Find neighborhood discloses an approximate city center rather than inventing a neighborhood", async () => {
  const fetchFn = (async (resource: RequestInfo | URL, init?: RequestInit) => {
    const url = String(resource);
    if (url.includes("geocode/json")) {
      const address = new URL(url).searchParams.get("address") ?? "";
      return address.startsWith("Doctor Phillips")
        ? json({ status: "ZERO_RESULTS" })
        : json({ status: "OK", results: [{
          types: ["locality", "political"], geometry: { location: { lat: 28.5383, lng: -81.3792 } },
        }] });
    }
    assert.ok(init?.method === "POST");
    return json({ places: [] });
  }) as typeof fetch;
  const result = await findNeighborhoodMapLocation(query, "test-key", fetchFn);
  assert.deepEqual(result.location, {
    latitude: 28.5383, longitude: -81.3792, precision: "city",
  });
  assert.equal(result.unavailable, false);
});

test("Map search rejects named businesses and fails transparently on unavailable providers", async () => {
  const business = (async (resource: RequestInfo | URL) => {
    if (String(resource).includes("geocode/json")) return json({ status: "ZERO_RESULTS" });
    return json({ places: [{
      displayName: { text: "Doctor Phillips" }, types: ["restaurant", "establishment"],
      location: { latitude: 28.5, longitude: -81.4 },
    }] });
  }) as typeof fetch;
  const notFound = await findNeighborhoodMapLocation(query, "test-key", business);
  assert.deepEqual(notFound, { location: null, unavailable: false });
  const forbidden = (async () => json({ error: { message: "disabled" } }, 403)) as typeof fetch;
  const unavailable = await findNeighborhoodMapLocation(query, "test-key", forbidden);
  assert.deepEqual(unavailable, { location: null, unavailable: true });
});

test("Map viewport and un-applied corners round trip per user, page and browser tab", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  };
  const a = neighborhoodMapSessionKey("agent-a", "new");
  const b = neighborhoodMapSessionKey("agent-b", "new");
  const edit = neighborhoodMapSessionKey("agent-a", "existing");
  const state = { open: true, center: { lat: 28.446, lon: -81.491 }, zoom: 14,
    boundaryKey: "null", vertices: [[-81.49, 28.445], [-81.48, 28.445]] as [number, number][] };
  assert.equal(writeNeighborhoodMapSession(storage, a, state), true);
  assert.deepEqual(readNeighborhoodMapSession(storage, a), state);
  assert.equal(readNeighborhoodMapSession(storage, b), null);
  assert.equal(readNeighborhoodMapSession(storage, edit), null);
  data.set(a, '{"open":true,"center":{"lat":100,"lon":0},"zoom":14,"vertices":[],"boundaryKey":"null"}');
  assert.equal(readNeighborhoodMapSession(storage, a), null, "invalid browser state is ignored");
  writeNeighborhoodMapSession(storage, a, state);
  clearNeighborhoodMapSession(storage, a);
  assert.equal(readNeighborhoodMapSession(storage, a), null,
    "discarding clears stale corners before starting a different new neighborhood");
  assert.equal(readNeighborhoodMapSession(storage, b), null, "discard is scoped to the active owner");
  const ownerUi = readFileSync("client/src/components/agentPage/NeighborhoodPageSettings.tsx", "utf8");
  assert.ok(ownerUi.includes("clearNeighborhoodMapSession(window.sessionStorage"));
  assert.ok(ownerUi.includes("setMapEditorRevision((revision) => revision + 1)"),
    "discard remounts map with the saved boundary, not stale local vertices");
});

test("Unrelated-tab writes must not erase active unsaved guide text", () => {
  const activeDraft = { values: { ...EMPTY_NEIGHBORHOOD,
    name: "Doctor Phillips", city: "Orlando", state: "Florida",
    content: "The article I am still typing" }, baseVersion: null };
  const active: NeighborhoodDrafts = { active: "new", entries: { new: activeDraft } };
  const stale: NeighborhoodDrafts = { active: null, entries: {} };
  assert.deepEqual(mergeNeighborhoodDraftsPreservingActive(stale, active), active);
  const otherId = "0363978d-9770-4f3e-bb6e-a6ac5d992880";
  const other = { values: { ...EMPTY_NEIGHBORHOOD, name: "Victoria Park" },
    baseVersion: "2026-11-20T12:00:00.000Z" };
  const incoming: NeighborhoodDrafts = { active: otherId, entries: { [otherId]: other } };
  assert.deepEqual(mergeNeighborhoodDraftsPreservingActive(incoming, active),
    { active: "new", entries: { ...incoming.entries, new: activeDraft } });
});
