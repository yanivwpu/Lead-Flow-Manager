/** Run: npx tsx tests/prospect-ai-multilingual-discovery.test.ts */
import assert from "node:assert/strict";
import {
  detectProspectDiscoveryLanguage,
  normalizeProspectDiscoveryQuery,
} from "../server/prospectAI/discoveryQueryNormalizer";
import { GooglePlacesDiscoveryProvider } from "../server/prospectAI/providers/googlePlacesProvider";

const translations: Record<string, string> = {
  "סוכני נדל״ן": "real estate agents",
  "רופאי שיניים": "dentists",
  "agentes inmobiliarios": "real estate agents",
  "clínicas dentales": "dental clinics",
};
const translate = async ({ businessType }: { businessType: string }) => translations[businessType] || "";

{
  let calls = 0;
  const result = await normalizeProspectDiscoveryQuery(
    { businessType: "Real estate agents", location: "Miami", preferredLocale: "en" },
    { translateBusinessCategory: async () => { calls += 1; return "unused"; } },
  );
  assert.equal(result.providerBusinessType, "Real estate agents");
  assert.equal(result.providerLocation, "Miami");
  assert.equal(calls, 0, "English discovery must not spend an AI call");
}

{
  const result = await normalizeProspectDiscoveryQuery(
    { businessType: "סוכני נדל״ן", location: "תל אביב", preferredLocale: "he" },
    { translateBusinessCategory: translate },
  );
  assert.equal(result.providerBusinessType, "real estate agents");
  assert.equal(result.providerLocation, "תל אביב");
  assert.equal(result.originalBusinessType, "סוכני נדל״ן");
}

{
  const result = await normalizeProspectDiscoveryQuery(
    { businessType: "רופאי שיניים", location: "תל אביב" },
    { translateBusinessCategory: translate },
  );
  assert.equal(result.providerBusinessType, "dentists");
  assert.equal(result.providerLocation, "תל אביב");
  assert.equal(detectProspectDiscoveryLanguage("רופאי שיניים"), "he");
}

for (const businessType of ["agentes inmobiliarios", "clínicas dentales"]) {
  const result = await normalizeProspectDiscoveryQuery(
    { businessType, location: "Miami", preferredLocale: "es" },
    { translateBusinessCategory: translate },
  );
  assert.match(result.providerBusinessType, /real estate agents|dental clinics/);
  assert.equal(result.originalBusinessType, businessType);
}

{
  const result = await normalizeProspectDiscoveryQuery(
    { businessType: "clínicas dentales", location: "Fort Lauderdale", preferredLocale: "es" },
    { translateBusinessCategory: async () => { throw new Error("secret upstream failure"); } },
  );
  assert.equal(result.providerBusinessType, "clínicas dentales");
  assert.equal(result.providerLocation, "Fort Lauderdale");
  assert.equal(result.fallbackUsed, true);
}

{
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
  let providerQuery = "";
  const provider = new GooglePlacesDiscoveryProvider(async (_input, init) => {
    providerQuery = String(JSON.parse(String(init?.body)).textQuery);
    return new Response(JSON.stringify({ places: [] }), { status: 200 });
  });
  const normalized = await normalizeProspectDiscoveryQuery(
    { businessType: "clínicas dentales", location: "Miami", preferredLocale: "es" },
    { translateBusinessCategory: translate },
  );
  await provider.discover({
    businessType: normalized.providerBusinessType,
    location: normalized.providerLocation,
    targetCount: 25,
    quotaRemaining: 25,
    locationExpansion: "exact",
  });
  assert.equal(providerQuery, "dental clinics in Miami");
}

console.log("prospect-ai-multilingual-discovery.test.ts: all assertions passed");
