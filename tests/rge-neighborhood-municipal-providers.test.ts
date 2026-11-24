import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryBounds, selectExactNamedNeighborhood, type NeighborhoodBoundary,
} from "../shared/agent/neighborhoodListingGeo";
import {
  resolveNeighborhoodBoundary, isSupportedOfficialNeighborhoodSource,
} from "../server/agentPage/neighborhoodBoundaryService";

function polygon(lat: number, lon: number): NeighborhoodBoundary {
  return { type: "Polygon", coordinates: [[
    [lon, lat], [lon + 0.01, lat], [lon + 0.01, lat + 0.01],
    [lon, lat + 0.01], [lon, lat],
  ]] };
}

test("South Florida supported sources are country/state/city-scoped", () => {
  assert.equal(isSupportedOfficialNeighborhoodSource("Miami", "Florida"), true);
  assert.equal(isSupportedOfficialNeighborhoodSource("Miami", "FL", "US"), true);
  assert.equal(isSupportedOfficialNeighborhoodSource("Pompano Beach", "FL"), true);
  assert.equal(isSupportedOfficialNeighborhoodSource("Fort Lauderdale", "Florida"), true);
  assert.equal(isSupportedOfficialNeighborhoodSource("Ft Lauderdale", "FL"), true);
  assert.equal(isSupportedOfficialNeighborhoodSource("Miami Beach", "Florida"), false);
  assert.equal(isSupportedOfficialNeighborhoodSource("Pompano Beach", "Georgia"), false);
  assert.equal(isSupportedOfficialNeighborhoodSource("Miami", "Florida", "Canada"), false);
  assert.equal(isSupportedOfficialNeighborhoodSource("London", "England", "GB"), false);
});

test("exact provider name AND city are required; ambiguous polygons fail closed", () => {
  const valid = { type: "Feature", properties: { CITYNAME: "Pompano Beach", NEIGHBORHO: "Harbor Village" }, geometry: polygon(26.22, -80.13) };
  const wrongCity = { type: "Feature", properties: { CITYNAME: "Miami", NEIGHBORHO: "Harbor Village" }, geometry: polygon(25.8, -80.2) };
  const city = { name: "Pompano Beach", fields: ["CITYNAME"] };
  const selected = selectExactNamedNeighborhood([valid, wrongCity], "Harbor Village", ["NEIGHBORHO"], city);
  assert.deepEqual(selected, valid.geometry);
  assert.equal(selectExactNamedNeighborhood([valid, valid], "Harbor Village", ["NEIGHBORHO"], city), null);
  assert.equal(selectExactNamedNeighborhood([wrongCity], "Harbor Village", ["NEIGHBORHO"], city), null);
  assert.equal(selectExactNamedNeighborhood([valid], "Harbor", ["NEIGHBORHO"], city), null);
  assert.deepEqual(boundaryBounds(selected!), {
    minLon: -80.13, maxLon: -80.11999999999999,
    minLat: 26.22, maxLat: 26.23,
  });
});

test("municipal source retrieval is allowlisted, source-separated and cached", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  const fort = polygon(26.12, -80.14);
  const miami = polygon(25.77, -80.23);
  const pompano = polygon(26.23, -80.12);
  const datasets: Record<string, unknown[]> = {
    "gis.fortlauderdale.gov": [{ type: "Feature", properties: { OFFICIALNAME: "Victoria Park Civic Association" }, geometry: fort }],
    "gis.miami.gov": [{ type: "Feature", properties: { NEIGHBORHOOD: "Coconut Grove" }, geometry: miami }],
    "services.arcgis.com": [{ type: "Feature", properties: { CITYNAME: "Pompano Beach", NEIGHBORHO: "Harbor Village" }, geometry: pompano }],
  };
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url.toString());
    assert.equal(url.searchParams.get("f"), "geojson");
    assert.equal(url.searchParams.get("returnGeometry"), "true");
    assert.equal(url.searchParams.get("outSR"), "4326");
    assert.equal(url.searchParams.get("where"), "1=1");
    assert.ok(url.hostname in datasets, "unknown host");
    return Response.json({ type: "FeatureCollection", features: datasets[url.hostname] });
  }) as typeof fetch;

  try {
    const resultMiami = await resolveNeighborhoodBoundary({ name: "Coconut Grove", city: "Miami", state: "FL" });
    const resultFort = await resolveNeighborhoodBoundary({ name: "Victoria Park", city: "Ft Lauderdale", state: "Florida" });
    const [pompanoOne, pompanoTwo] = await Promise.all([
      resolveNeighborhoodBoundary({ name: "Harbor Village", city: "Pompano Beach", state: "Florida" }),
      resolveNeighborhoodBoundary({ name: "Harbor Village", city: "Pompano Beach", state: "Florida" }),
    ]);
    for (const result of [resultMiami, resultFort, pompanoOne, pompanoTwo]) {
      assert.equal(result.status, "verified");
      if (result.status === "verified") assert.ok(result.source.length > 12);
    }
    assert.equal(urls.length, 3, "one request per municipal provider, shared cache across agents");
    assert.equal((await resolveNeighborhoodBoundary({ name: "Harbor", city: "Pompano Beach", state: "FL" })).status, "unmatched");
    assert.equal((await resolveNeighborhoodBoundary({ name: "Coconut Grove", city: "Miami", state: "FL", country: "CA" })).status, "unsupported");
    assert.equal(urls.length, 3, "unsupported country and name never trigger new requests");
    assert.ok(urls.find((u) => u.includes("gis.miami.gov"))?.includes("NEIGHBORHOOD"));
    assert.ok(urls.find((u) => u.includes("Neighborhoods_Exposure"))?.includes("CITYNAME"));
  } finally {
    globalThis.fetch = original;
  }
});
