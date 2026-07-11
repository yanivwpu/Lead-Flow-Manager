/**
 * GHL Prospect Import location resolution for company vs location OAuth tokens.
 * Run: npx tsx tests/ghl-prospect-location.test.ts
 */
import assert from "node:assert/strict";
import type { Integration } from "../shared/schema";
import {
  isGhlCompanyScopedIntegration,
  resolveGhlProspectLocationId,
  readGhlLocationId,
} from "../server/prospectImport/ghlApiClient";

function mockIntegration(config: Record<string, unknown>): Integration {
  return {
    id: "int-1",
    userId: "user-1",
    type: "gohighlevel",
    name: "CRM Integration",
    config,
    accessToken: "token",
    refreshToken: "refresh",
    tokenExpiresAt: new Date(),
    isActive: true,
    lastSyncAt: null,
    createdAt: new Date(),
  };
}

const locationIntegration = mockIntegration({
  userType: "Location",
  companyId: "company-1",
  locationId: "loc-abc",
});

const companyIntegration = mockIntegration({
  userType: "Company",
  companyId: "company-1",
  locationId: null,
});

assert.equal(readGhlLocationId(locationIntegration), "loc-abc");
assert.equal(readGhlLocationId(companyIntegration), null);
assert.equal(isGhlCompanyScopedIntegration(locationIntegration), false);
assert.equal(isGhlCompanyScopedIntegration(companyIntegration), true);
assert.equal(resolveGhlProspectLocationId(locationIntegration), "loc-abc");
assert.equal(resolveGhlProspectLocationId(companyIntegration), null);
assert.equal(resolveGhlProspectLocationId(companyIntegration, "loc-picked"), "loc-picked");

console.log("ghl-prospect-location.test.ts: OK");
