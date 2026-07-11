/**
 * GHL Prospect Import Company → Location token exchange tests.
 * Run: npx tsx tests/ghl-prospect-api-token.test.ts
 */
import assert from "node:assert/strict";
import type { Integration } from "../shared/schema";
import {
  clearGhlLocationTokenCache,
  getCachedGhlLocationToken,
  setCachedGhlLocationToken,
} from "../server/prospectImport/ghlLocationTokenCache";
import {
  exchangeGhlLocationAccessToken,
  getGhlProspectApiToken,
  GhlProspectTokenError,
} from "../server/prospectImport/ghlProspectApiToken";

function mockIntegration(config: Record<string, unknown>, overrides?: Partial<Integration>): Integration {
  return {
    id: "int-company-1",
    userId: "user-1",
    type: "gohighlevel",
    name: "CRM Integration - Agency",
    config,
    accessToken: "agency-access-token",
    refreshToken: "agency-refresh-token",
    tokenExpiresAt: new Date(Date.now() + 3600_000),
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

type FetchCall = { url: string; init?: RequestInit };

function createFetchMock(handlers: {
  locationToken?: (call: FetchCall) => Response | Promise<Response>;
  contacts?: (call: FetchCall) => Response | Promise<Response>;
  default?: (call: FetchCall) => Response | Promise<Response>;
}): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/oauth/locationToken") || url.includes("/oauth/location-token")) {
      return handlers.locationToken
        ? await handlers.locationToken({ url, init })
        : jsonResponse(404, { message: "not found" });
    }
    if (url.includes("/contacts/search")) {
      return handlers.contacts
        ? await handlers.contacts({ url, init })
        : jsonResponse(200, { contacts: [], total: 0 });
    }
    if (handlers.default) return handlers.default({ url, init });
    return jsonResponse(404, { message: "unexpected url" });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

clearGhlLocationTokenCache();

// Cache helpers
setCachedGhlLocationToken("int-1", "loc-1", "cached-location-token", 3600);
assert.equal(getCachedGhlLocationToken("int-1", "loc-1"), "cached-location-token");
clearGhlLocationTokenCache();
assert.equal(getCachedGhlLocationToken("int-1", "loc-1"), null);

// Location-scoped integration uses stored token directly (no exchange)
{
  const locationIntegration = mockIntegration(
    { userType: "Location", companyId: "co-1", locationId: "loc-direct" },
    { id: "int-location-1", accessToken: "location-access-token" },
  );
  const { fetchImpl, calls } = createFetchMock({});
  const resolved = await getGhlProspectApiToken(locationIntegration, "loc-direct", { fetchImpl });
  assert.equal(resolved.token, "location-access-token");
  assert.equal(resolved.locationTokenExchangeAttempted, false);
  assert.equal(
    calls.some((c) => c.url.includes("locationToken") || c.url.includes("location-token")),
    false,
  );
}

// Company-scoped integration exchanges before location API usage
{
  clearGhlLocationTokenCache();
  const companyIntegration = mockIntegration({
    userType: "Company",
    companyId: "co-1",
    locationId: null,
  });

  const { fetchImpl, calls } = createFetchMock({
    locationToken: () =>
      jsonResponse(200, {
        access_token: "derived-location-token",
        expires_in: 3600,
        userType: "Location",
      }),
  });

  const resolved = await getGhlProspectApiToken(companyIntegration, "loc-picked", { fetchImpl });
  assert.equal(resolved.token, "derived-location-token");
  assert.equal(resolved.locationTokenExchangeAttempted, true);
  assert.equal(resolved.locationTokenExchangeSucceeded, true);
  assert.equal(resolved.locationId, "loc-picked");

  const exchangeCall = calls.find(
    (c) => c.url.includes("locationToken") || c.url.includes("location-token"),
  );
  assert.ok(exchangeCall, "expected location token exchange request");
  assert.equal(
    (exchangeCall?.init?.headers as Record<string, string> | undefined)?.Authorization,
    "Bearer agency-access-token",
  );
  const body = String(exchangeCall?.init?.body || "");
  assert.ok(body.includes("companyId=co-1"));
  assert.ok(body.includes("locationId=loc-picked"));

  assert.equal(
    getCachedGhlLocationToken(companyIntegration.id, "loc-picked"),
    "derived-location-token",
  );
  assert.notEqual(resolved.token, "agency-access-token");
}

// Failed exchange returns a clear error
{
  clearGhlLocationTokenCache();
  const companyIntegration = mockIntegration({
    userType: "Company",
    companyId: "co-1",
    locationId: null,
  });
  const { fetchImpl } = createFetchMock({
    locationToken: () => jsonResponse(401, { message: "This authClass type is not allowed to access this scope." }),
  });

  await assert.rejects(
    () => getGhlProspectApiToken(companyIntegration, "loc-picked", { fetchImpl }),
    (err: unknown) => {
      assert.ok(err instanceof GhlProspectTokenError);
      assert.equal(err.code, "location_token_exchange_failed");
      assert.match(err.message, /Location access token/i);
      assert.match(err.message, /authClass/i);
      return true;
    },
  );
}

// Exchange helper uses agency bearer and form body
{
  const { fetchImpl, calls } = createFetchMock({
    locationToken: () => jsonResponse(200, { access_token: "loc-tok", expires_in: 7200 }),
  });
  const result = await exchangeGhlLocationAccessToken({
    agencyAccessToken: "agency-bearer",
    companyId: "co-99",
    locationId: "loc-99",
    fetchImpl,
  });
  assert.equal(result.accessToken, "loc-tok");
  assert.equal(result.expiresIn, 7200);
  const exchangeCall = calls[0];
  assert.equal(exchangeCall.init?.method, "POST");
  assert.equal(
    (exchangeCall.init?.headers as Record<string, string>).Authorization,
    "Bearer agency-bearer",
  );
}

// Import loop guard: auth failure before contact fetch means zero imports
{
  let imported = 0;
  const simulateImportJob = async (fetchContacts: () => Promise<unknown[]>) => {
    try {
      await fetchContacts();
      imported += 1;
    } catch {
      return { imported, status: "failed" as const };
    }
    return { imported, status: "completed" as const };
  };

  const result = await simulateImportJob(async () => {
    throw new GhlProspectTokenError("Could not obtain a Location access token", "location_token_exchange_failed");
  });
  assert.equal(result.imported, 0);
  assert.equal(result.status, "failed");
}

console.log("ghl-prospect-api-token.test.ts: OK");
