/**
 * GHL Activation CRM green / unmatched / company linking / status normalize.
 * Run: npx tsx tests/ghl-activation-connection-state.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertNoGhlSecretsInAdminPayload,
  classifyGhlAdminLinkState,
  isGhlMarketplaceUninstalled,
  isUnmatchedGhlMarketplaceInstall,
  isUsableGhlConnectionForUser,
  isUsableGhlIntegration,
  normalizeGhlMarketplaceInstallStatus,
  selectMarketplaceRowForOAuthLink,
} from "../shared/ghlConnectionState";
import { deriveActivationChannelConnections } from "../shared/adminActivationMetrics";
import { deriveAdminEmailIndicator, deriveAdminUserChannelConnections } from "../shared/adminChannelConnectionStatus";

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

const usableIntegration = {
  type: "gohighlevel",
  isActive: true,
  accessToken: "tok_live",
  userId: "user-1",
};

function run(name: string, fn: () => void) {
  fn();
  console.log(`✓ ${name}`);
}

run("A: active usable linked integration → CRM green", () => {
  assert.equal(isUsableGhlIntegration(usableIntegration), true);
  assert.equal(
    isUsableGhlConnectionForUser({
      integration: usableIntegration,
      marketplace: { installationStatus: "Active" },
    }),
    true,
  );
  const connections = deriveActivationChannelConnections({
    user: { id: "user-1" },
    whatsappConnected: false,
    facebookConnected: false,
    instagramConnected: false,
    ghlUserIds: new Set(["user-1"]),
  });
  assert.equal(connections.ghlConnected, true);
});

run("B: integration inactive → CRM not green", () => {
  assert.equal(
    isUsableGhlConnectionForUser({
      integration: { ...usableIntegration, isActive: false },
      marketplace: { installationStatus: "Active" },
    }),
    false,
  );
});

run("C: uninstalled → CRM not green", () => {
  assert.equal(
    isUsableGhlConnectionForUser({
      integration: usableIntegration,
      marketplace: { installationStatus: "Un-installed" },
    }),
    false,
  );
  assert.equal(classifyGhlAdminLinkState({ marketplaceStatus: "Uninstalled", integration: usableIntegration }), "Uninstalled");
});

run("D: 8/19 marketplace-only OAuth → unmatched, not green", () => {
  const marketplace = {
    locationId: "SkaXRzVJpPIzp75qnaV6",
    companyId: "u1yHK7xvllSk5Oqw6mip",
    integrationId: null,
    whachatUserId: null,
    installationStatus: "Active",
    source: "oauth",
  };
  assert.equal(isUnmatchedGhlMarketplaceInstall({ marketplace, integration: null }), true);
  assert.equal(classifyGhlAdminLinkState({ marketplaceStatus: "Active", hasMarketplaceRow: true, integration: null }), "Unmatched");
  const connections = deriveActivationChannelConnections({
    user: { id: "nobody" },
    whatsappConnected: true,
    facebookConnected: false,
    instagramConnected: false,
    ghlUserIds: new Set(),
  });
  assert.equal(connections.ghlConnected, false);
  assert.equal(connections.whatsappConnected, true);
});

run("E: webhook-only install → unmatched", () => {
  assert.equal(
    isUnmatchedGhlMarketplaceInstall({
      marketplace: {
        locationId: "loc-1",
        companyId: "co-1",
        installationStatus: "Active",
        source: "webhook",
      },
    }),
    true,
  );
});

run("F: CSV-only install → unmatched", () => {
  assert.equal(
    isUnmatchedGhlMarketplaceInstall({
      marketplace: {
        locationId: "loc-csv",
        companyId: "co-csv",
        installationStatus: "Active",
        source: "csv",
      },
    }),
    true,
  );
});

run("G: linked marketplace + usable integration → connected", () => {
  assert.equal(
    classifyGhlAdminLinkState({
      marketplaceStatus: "Active",
      hasMarketplaceRow: true,
      integration: usableIntegration,
    }),
    "Linked",
  );
});

run("H: unmatched admin payload has no secrets", () => {
  const unmatchedRow = {
    id: "ef7c-e0906d",
    installDate: "2026-08-20T02:25:49.069Z",
    source: "OAuth",
    agency: null,
    subAccountName: "CRM Integration - Location",
    locationId: "SkaXRzVJpPIzp75qnaV6",
    companyId: "u1yHK7xvllSk5Oqw6mip",
    status: "Unmatched" as const,
    installationStatus: "Active",
    oauthRecoverable: true,
  };
  assertNoGhlSecretsInAdminPayload(unmatchedRow);
  const mapper = read("server/ghlMarketplaceService.ts");
  const unmatchedFn = mapper.slice(mapper.indexOf("unmatched.push"), mapper.indexOf("unmatched.sort"));
  assert.doesNotMatch(unmatchedFn, /rawPayload:/);
  assert.doesNotMatch(unmatchedFn, /accessToken:/);
  assert.doesNotMatch(unmatchedFn, /refreshToken:/);
});

run("I: company-level OAuth selects locationId=null match", () => {
  const rows = [
    { locationId: "loc-A", companyId: "co-1" },
    { locationId: null, companyId: "co-1" },
    { locationId: "loc-B", companyId: "co-1" },
  ];
  const picked = selectMarketplaceRowForOAuthLink(rows, null, "co-1");
  assert.equal(picked?.locationId, null);
  const locPick = selectMarketplaceRowForOAuthLink(rows, "loc-B", "co-1");
  assert.equal(locPick?.locationId, "loc-B");
});

run("J: Un-installed normalizes correctly", () => {
  assert.equal(normalizeGhlMarketplaceInstallStatus("Un-installed"), "Uninstalled");
  assert.equal(normalizeGhlMarketplaceInstallStatus("uninstalled"), "Uninstalled");
  assert.equal(normalizeGhlMarketplaceInstallStatus("UNINSTALLED"), "Uninstalled");
  assert.equal(isGhlMarketplaceUninstalled("Un-installed"), true);
  assert.equal(isGhlMarketplaceUninstalled("Active"), false);
});

run("K: metrics distinguish Connected vs Unmatched", () => {
  const connected = isUsableGhlConnectionForUser({
    integration: usableIntegration,
    marketplace: { installationStatus: "Active" },
  })
    ? 1
    : 0;
  const unmatchedOauth = isUnmatchedGhlMarketplaceInstall({
    marketplace: { locationId: "SkaXRzVJpPIzp75qnaV6", companyId: "u1yHK7xvllSk5Oqw6mip", installationStatus: "Active", source: "oauth" },
  })
    ? 1
    : 0;
  assert.equal(connected, 1);
  assert.equal(unmatchedOauth, 1);
  const svc = read("server/adminActivationService.ts");
  assert.match(svc, /ghlConnected: ghlConnectionState\.connectedUserIds\.size/);
  assert.match(svc, /ghlUnmatched: ghlConnectionState\.unmatched\.length/);
});

run("L–M: Email connected vs signup email", () => {
  assert.equal(deriveAdminEmailIndicator({ syncStatus: "connected", provider: "gmail" }).state, "connected");
  const none = deriveAdminUserChannelConnections({
    user: { whatsappProvider: "meta", metaConnected: false },
    channelSettings: [],
  });
  assert.equal(none.email.state, "disconnected");
});

run("N: WA/FB/IG/Shopify unchanged when only GHL/email change", () => {
  const connections = deriveActivationChannelConnections({
    user: { id: "u1", shopifyShop: "store.myshopify.com", shopifyInstalledAt: new Date() },
    whatsappConnected: true,
    facebookConnected: true,
    instagramConnected: true,
    ghlUserIds: new Set(),
    emailConnected: true,
  });
  assert.equal(connections.whatsappConnected, true);
  assert.equal(connections.facebookConnected, true);
  assert.equal(connections.instagramConnected, true);
  assert.equal(connections.shopifyConnected, true);
  assert.equal(connections.ghlConnected, false);
  assert.equal(connections.emailConnected, true);
});

run("no auto-provision user from unmatched OAuth", () => {
  const routes = read("server/ghlRoutes.ts");
  assert.match(routes, /Do NOT auto-create a WhachatCRM user/);
  assert.match(routes, /recording marketplace install without integration link/);
});

run("company-only link query requires locationId IS NULL", () => {
  const svc = read("server/ghlMarketplaceService.ts");
  const link = svc.slice(
    svc.indexOf("export async function linkMarketplaceInstallToIntegration"),
    svc.indexOf("export async function markMarketplaceUninstalled"),
  );
  assert.match(link, /locationId} IS NULL/);
});

console.log("ghl-activation-connection-state.test.ts OK");
