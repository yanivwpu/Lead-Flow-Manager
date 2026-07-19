/**
 * Prospect AI foundation tests (quotas, normalization, provider abstraction).
 * Run: npx tsx tests/prospect-ai-foundation.test.ts
 * No external network — Google Places provider uses an injected fetch.
 */
import assert from "node:assert/strict";
import {
  getProspectAiMonthlyQuota,
  isProspectAiPlanEligible,
  PROSPECT_AI_MONTHLY_QUOTAS,
} from "../shared/prospectAI";
import {
  normalizeProspectCandidate,
  normalizeProspectList,
  validateDiscoverInput,
} from "../server/prospectAI/normalize";
import {
  GooglePlacesDiscoveryProvider,
  mapPlacesApiPlaceToCandidate,
  sanitizePlacesRaw,
} from "../server/prospectAI/providers/googlePlacesProvider";
import { getProspectDiscoveryProvider } from "../server/prospectAI/providers";
import type { ProspectDiscoveryProvider } from "../server/prospectAI/providers/types";

function testQuotas() {
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.starter, 100);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.pro, 500);
  assert.equal(PROSPECT_AI_MONTHLY_QUOTAS.free, 0);
  assert.equal(getProspectAiMonthlyQuota("starter"), 100);
  assert.equal(getProspectAiMonthlyQuota("pro"), 500);
  assert.equal(getProspectAiMonthlyQuota("free"), 0);
  assert.equal(isProspectAiPlanEligible("free"), false);
  assert.equal(isProspectAiPlanEligible("starter"), true);
  assert.equal(isProspectAiPlanEligible("pro"), true);
}

function testValidateDiscoverInput() {
  assert.equal(validateDiscoverInput(null).ok, false);
  assert.equal(validateDiscoverInput({}).ok, false);
  assert.equal(validateDiscoverInput({ businessType: "a", location: "x" }).ok, false);

  const ok = validateDiscoverInput({
    businessType: "dentist",
    location: "Austin, TX",
    radiusKm: 10,
  });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.businessType, "dentist");
    assert.equal(ok.location, "Austin, TX");
    assert.equal(ok.radiusKm, 10);
  }

  const badRadius = validateDiscoverInput({
    businessType: "dentist",
    location: "Austin, TX",
    radiusKm: 999,
  });
  assert.equal(badRadius.ok, false);

  const noRadius = validateDiscoverInput({
    businessType: "cafe",
    location: "Miami",
  });
  assert.equal(noRadius.ok, true);
  if (noRadius.ok) assert.equal(noRadius.radiusKm, undefined);
}

function testNormalization() {
  assert.equal(normalizeProspectCandidate({ providerPlaceId: "", name: "X" }), null);
  assert.equal(normalizeProspectCandidate({ providerPlaceId: "p1", name: "" }), null);

  const n = normalizeProspectCandidate({
    providerPlaceId: " places/ChIJabc ",
    name: "  Bright Dental  ",
    phone: "(512) 555-1212",
    website: "example.com",
    email: "Info@Example.COM",
    latitude: 30.2,
    longitude: -97.7,
    rating: 4.55,
    reviewCount: 12.9,
    businessType: "dentist",
  });
  assert.ok(n);
  assert.equal(n!.providerPlaceId, "places/ChIJabc");
  assert.equal(n!.name, "Bright Dental");
  assert.equal(n!.phone, "5125551212");
  assert.equal(n!.website, "https://example.com");
  assert.equal(n!.email, "info@example.com");
  assert.equal(n!.rating, 4.6);
  assert.equal(n!.reviewCount, 12);

  const list = normalizeProspectList([
    { providerPlaceId: "a", name: "One" },
    { providerPlaceId: "a", name: "Dup" },
    { providerPlaceId: "b", name: "Two" },
    { providerPlaceId: "", name: "Bad" },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(
    list.map((p) => p.providerPlaceId),
    ["a", "b"],
  );
}

function testProviderAbstractionRegistry() {
  const provider = getProspectDiscoveryProvider("google_places");
  assert.equal(provider.id, "google_places");
  assert.equal(typeof provider.discover, "function");
}

function testGooglePlacesMappingSanitization() {
  const mapped = mapPlacesApiPlaceToCandidate({
    id: "places/ChIJ123",
    displayName: { text: "North Clinic" },
    formattedAddress: "1 Main St",
    nationalPhoneNumber: "512-111-2222",
    websiteUri: "https://clinic.test",
    location: { latitude: 1, longitude: 2 },
    types: ["dentist", "health"],
    rating: 4.2,
    userRatingCount: 9,
    businessStatus: "OPERATIONAL",
  });
  assert.equal(mapped.providerPlaceId, "ChIJ123");
  assert.equal(mapped.name, "North Clinic");

  const sanitized = sanitizePlacesRaw({
    id: "places/ChIJ123",
    displayName: { text: "North Clinic" },
    nationalPhoneNumber: "512-111-2222",
    websiteUri: "https://clinic.test",
    types: ["dentist"],
  });
  assert.equal(sanitized.hasPhone, true);
  assert.equal(sanitized.hasWebsite, true);
  assert.equal("nationalPhoneNumber" in sanitized, false);
  assert.equal("websiteUri" in sanitized, false);
}

async function testGooglePlacesProviderNoNetwork() {
  const prev = process.env.GOOGLE_PLACES_API_KEY;
  process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";

  let sawApiKeyHeader = false;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("geocode")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [{ geometry: { location: { lat: 30.27, lng: -97.74 } } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("places:searchText")) {
      const headers = init?.headers as Record<string, string>;
      sawApiKeyHeader = headers?.["X-Goog-Api-Key"] === "test-key-not-real";
      const body = JSON.parse(String(init?.body || "{}")) as {
        textQuery?: string;
        locationBias?: { circle?: { radius?: number } };
      };
      assert.match(body.textQuery || "", /dentist/i);
      assert.equal(body.locationBias?.circle?.radius, 5000);
      return new Response(
        JSON.stringify({
          places: [
            {
              id: "places/ChIJAAA",
              displayName: { text: "Austin Dentist" },
              formattedAddress: "Austin, TX",
              internationalPhoneNumber: "+1 512-555-0100",
              websiteUri: "https://dentist.test",
              location: { latitude: 30.27, longitude: -97.74 },
              types: ["dentist"],
              rating: 4.8,
              userRatingCount: 42,
              businessStatus: "OPERATIONAL",
            },
            {
              id: "places/ChIJBBB",
              displayName: { text: "Closed Shop" },
              businessStatus: "CLOSED_PERMANENTLY",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  const provider: ProspectDiscoveryProvider = new GooglePlacesDiscoveryProvider(fetchFn);
  const result = await provider.discover({
    businessType: "dentist",
    location: "Austin, TX",
    radiusKm: 5,
  });

  assert.equal(sawApiKeyHeader, true);
  assert.equal(result.prospects.length, 1);
  assert.equal(result.prospects[0].name, "Austin Dentist");
  assert.equal(result.prospects[0].providerPlaceId, "ChIJAAA");
  assert.equal(result.meta?.usedLocationBias, true);

  // Ensure error paths never echo the raw key from our test env into thrown messages casually.
  const failing: ProspectDiscoveryProvider = new GooglePlacesDiscoveryProvider(async () => {
    return new Response(JSON.stringify({ error: { message: "denied" } }), { status: 403 });
  });
  await assert.rejects(() => failing.discover({ businessType: "x", location: "y" }), /403/);

  if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
  else process.env.GOOGLE_PLACES_API_KEY = prev;
}

function testMissingApiKey() {
  const prev = process.env.GOOGLE_PLACES_API_KEY;
  delete process.env.GOOGLE_PLACES_API_KEY;
  const provider = new GooglePlacesDiscoveryProvider(async () => {
    throw new Error("should not fetch");
  });
  return provider
    .discover({ businessType: "cafe", location: "NYC" })
    .then(() => {
      assert.fail("expected missing key error");
    })
    .catch((err: unknown) => {
      assert.match(String(err), /GOOGLE_PLACES_API_KEY/);
    })
    .finally(() => {
      if (prev === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
      else process.env.GOOGLE_PLACES_API_KEY = prev;
    });
}

async function main() {
  testQuotas();
  testValidateDiscoverInput();
  testNormalization();
  testProviderAbstractionRegistry();
  testGooglePlacesMappingSanitization();
  await testGooglePlacesProviderNoNetwork();
  await testMissingApiKey();
  console.log("prospect-ai-foundation.test.ts: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
