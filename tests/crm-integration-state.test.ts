/**
 * CRM Integration card connection-state contract.
 * Run: npx tsx --test tests/crm-integration-state.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveCrmMarketplaceConnectionState,
  hasCustomerFacingActiveGhlMarketplaceInstall,
} from "../shared/ghlConnectionState";
import {
  CRM_COMPLETE_OAUTH_CTA,
  CRM_CONNECTED_DESCRIPTION,
  CRM_CONNECTION_REQUIRED_STATUS,
  CRM_INSTALL_CTA,
  CRM_INSTALLED_NOT_CONNECTED,
  CRM_NOT_CONNECTED_DESCRIPTION,
  CRM_NOT_CONNECTED_STATUS,
  CRM_RECONNECT_CTA,
  CRM_TOKEN_EXPIRED_DESCRIPTION,
} from "../shared/leadConnectorWhiteLabel";

const root = process.cwd();
const integrationsSrc = readFileSync(join(root, "client/src/pages/Integrations.tsx"), "utf8");
const diagnosticsSrc = readFileSync(join(root, "server/ghlConnectionDiagnostics.ts"), "utf8");
const routesSrc = readFileSync(join(root, "server/ghlRoutes.ts"), "utf8");

test("1. Connected installation", () => {
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: true,
      tokenExpired: false,
      hasActiveMarketplaceInstall: true,
    }),
    "connected",
  );
});

test("2. Active installation with incomplete authorization", () => {
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: false,
      tokenExpired: false,
      hasActiveMarketplaceInstall: true,
    }),
    "installed_incomplete",
  );
});

test("3. Active installation with expired authorization", () => {
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: true,
      tokenExpired: true,
      hasActiveMarketplaceInstall: true,
    }),
    "installed_expired",
  );
});

test("4. Uninstalled installation with revoked credentials", () => {
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: false,
      tokenExpired: false,
      hasActiveMarketplaceInstall: false,
    }),
    "not_connected",
  );
  assert.equal(
    hasCustomerFacingActiveGhlMarketplaceInstall([
      {
        locationId: "loc_1",
        companyId: "co_1",
        installationStatus: "Uninstalled",
      },
      {
        locationId: null,
        companyId: "co_1",
        installationStatus: "Uninstalled",
      },
    ]),
    false,
  );
});

test("5. No Marketplace installation", () => {
  assert.equal(hasCustomerFacingActiveGhlMarketplaceInstall([]), false);
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: false,
      tokenExpired: false,
      hasActiveMarketplaceInstall: false,
    }),
    "not_connected",
  );
});

test("6. Agency/location duplicate after uninstall cannot display Connected", () => {
  assert.equal(
    hasCustomerFacingActiveGhlMarketplaceInstall([
      {
        locationId: "loc_1",
        companyId: "co_1",
        installationStatus: "Uninstalled",
      },
      {
        locationId: null,
        companyId: "co_1",
        installationStatus: "Active",
      },
    ]),
    false,
  );
  assert.equal(
    deriveCrmMarketplaceConnectionState({
      hasUsableTokens: false,
      tokenExpired: false,
      hasActiveMarketplaceInstall: false,
    }),
    "not_connected",
  );
});

test("7. No duplicated state descriptions", () => {
  assert.equal(integrationsSrc.includes("crmIntegrationCardCopy"), true);
  assert.match(integrationsSrc, /crm-manage-state-description/);
  assert.doesNotMatch(integrationsSrc, /role="alert"\s*>\s*\{CRM_INSTALLED_NOT_CONNECTED\}/);
  assert.doesNotMatch(integrationsSrc, /text-amber-900">\s*\{CRM_INSTALLED_NOT_CONNECTED\}/);
  assert.doesNotMatch(integrationsSrc, /text-amber-900">\s*\{CRM_TOKEN_EXPIRED_DESCRIPTION\}/);
  assert.equal(CRM_CONNECTED_DESCRIPTION.includes("active"), true);
  assert.equal(CRM_INSTALLED_NOT_CONNECTED.includes("incomplete"), true);
  assert.equal(CRM_TOKEN_EXPIRED_DESCRIPTION.includes("renewed"), true);
  assert.equal(CRM_NOT_CONNECTED_DESCRIPTION.includes("Connect WhachatCRM"), true);
  assert.equal(CRM_CONNECTION_REQUIRED_STATUS, "Connection required");
  assert.equal(CRM_NOT_CONNECTED_STATUS, "Not connected");
  assert.equal(CRM_INSTALL_CTA, "Connect CRM");
  assert.equal(CRM_COMPLETE_OAUTH_CTA, "Finish connection");
  assert.equal(CRM_RECONNECT_CTA, "Reconnect CRM");
});

test("8. Diagnostic URL hidden for ordinary users", () => {
  assert.equal(integrationsSrc.split("Preview connection URL").length - 1, 1);
  assert.match(
    integrationsSrc,
    /isLeadConnector && canAccessCrmDiagnostics && !lcConnected && \([\s\S]{0,800}?Preview connection URL/,
  );
  assert.match(integrationsSrc, /lcStatus\?\.canAccessCrmDiagnostics \? \(/);
});

test("9. Diagnostic URL available only to authorized admins", () => {
  assert.match(routesSrc, /canAccessCrmDiagnostics:\s*canAccessGhlOAuthRecoveryTools/);
  assert.match(diagnosticsSrc, /hasCustomerFacingActiveGhlMarketplaceInstall/);
  assert.match(diagnosticsSrc, /connectionState/);
});
