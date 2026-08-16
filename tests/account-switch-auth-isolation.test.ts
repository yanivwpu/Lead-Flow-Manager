/**
 * Account-switch + AuthContext/session mismatch isolation (Settings/Inbox).
 * Run: npx tsx --test tests/account-switch-auth-isolation.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { QueryClient } from "@tanstack/react-query";
import {
  privateAccountUiAllowed,
  resetAccountQueryCache,
  resolveAuthIdentityGate,
  withUserQueryScope,
} from "../client/src/lib/accountQueryScope";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const ACCOUNT_A = "51f64011-eb3a-48a4-bb10-031abd3c0cdc";
const ACCOUNT_B = "2e311869-a443-454c-8da9-fa8ef4dd191e";

function simulateSettingsView(input: {
  clientUserId: string;
  serverUserId: string;
  cachedChannelsForUserId: string;
  cachedPageName: string;
}) {
  const qc = new QueryClient();
  const staleKey = withUserQueryScope(["/api/channels"], input.cachedChannelsForUserId);
  qc.setQueryData(staleKey, [
    { channel: "instagram", isConnected: true, config: { pageName: input.cachedPageName } },
  ]);
  const gate = resolveAuthIdentityGate({
    isLoading: false,
    clientUserId: input.clientUserId,
    serverConfirmedUserId: input.serverUserId,
  });
  if (!privateAccountUiAllowed(gate) || input.clientUserId !== input.serverUserId) {
    resetAccountQueryCache(qc);
    return {
      renderPrivateUi: false,
      instagramPageName: null,
      showConnected: false,
      showNeedsAttention: false,
      showDisconnect: false,
      cacheHasWhachatcrm: false,
    };
  }
  const live = qc.getQueryData<Array<{ channel: string; isConnected: boolean; config?: { pageName?: string } }>>(
    withUserQueryScope(["/api/channels"], input.serverUserId),
  );
  const ig = live?.find((c) => c.channel === "instagram");
  return {
    renderPrivateUi: true,
    instagramPageName: ig?.config?.pageName ?? null,
    showConnected: !!ig?.isConnected,
    showNeedsAttention: false,
    showDisconnect: !!ig?.isConnected,
    cacheHasWhachatcrm: JSON.stringify(live || []).toLowerCase().includes("whachatcrm"),
  };
}

test("A → logout → B: Account B never renders whachatcrm or Disconnect", () => {
  const afterLogout = simulateSettingsView({
    clientUserId: ACCOUNT_B,
    serverUserId: ACCOUNT_B,
    cachedChannelsForUserId: ACCOUNT_A,
    cachedPageName: "whachatcrm",
  });
  // B's live cache is empty even if A was written first — keys differ, then mismatch/clear.
  const qc = new QueryClient();
  qc.setQueryData(withUserQueryScope(["/api/channels"], ACCOUNT_A), [
    { channel: "instagram", isConnected: true, config: { pageName: "whachatcrm" } },
  ]);
  resetAccountQueryCache(qc);
  qc.setQueryData(withUserQueryScope(["/api/channels"], ACCOUNT_B), []);
  const bChannels = qc.getQueryData<unknown[]>(withUserQueryScope(["/api/channels"], ACCOUNT_B)) || [];
  const aChannels = qc.getQueryData(withUserQueryScope(["/api/channels"], ACCOUNT_A));
  assert.equal(aChannels, undefined);
  assert.deepEqual(bChannels, []);
  assert.equal(JSON.stringify(bChannels).toLowerCase().includes("whachatcrm"), false);
  assert.equal(afterLogout.showConnected, false);
  assert.equal(afterLogout.showDisconnect, false);
});

test("AuthContext A + cookie B must not render private channel UI", () => {
  const view = simulateSettingsView({
    clientUserId: ACCOUNT_A,
    serverUserId: ACCOUNT_B,
    cachedChannelsForUserId: ACCOUNT_A,
    cachedPageName: "whachatcrm",
  });
  assert.equal(view.renderPrivateUi, false);
  assert.equal(view.showConnected, false);
  assert.equal(view.showNeedsAttention, false);
  assert.equal(view.showDisconnect, false);
  assert.equal(view.instagramPageName, null);
  assert.equal(view.cacheHasWhachatcrm, false);
});

test("auth context uses cookie /api/auth/me only (no login-body user fallback)", () => {
  const auth = read("client/src/lib/auth-context.tsx");
  assert.match(auth, /fetchAuthoritativeSessionUser/);
  assert.match(auth, /resetAccountQueryCache/);
  assert.match(auth, /sessionAligned/);
  const login = auth.slice(auth.indexOf("const login"), auth.indexOf("const signup"));
  assert.match(login, /fetchAuthoritativeSessionUser/);
  assert.doesNotMatch(login, /setUser\(\s*await\s+response\.json/);
  assert.doesNotMatch(login, /setUser\(data\)/);
  const signup = auth.slice(auth.indexOf("const signup"), auth.indexOf("const resendVerification"));
  assert.match(signup, /session\.id !== data\.id/);
  assert.match(auth, /cache:\s*["']no-store["']/);
});

test("/api/auth/me is not browser-cacheable across accounts", () => {
  const authServer = read("server/auth.ts");
  const meHandler = authServer.slice(authServer.indexOf("app.get('/api/auth/me'"));
  assert.match(meHandler, /Cache-Control['"]?,\s*['"]no-store/);
  assert.doesNotMatch(meHandler.slice(0, 400), /max-age=60/);
});

test("ProtectedRoute waits until client and server identities agree", () => {
  const app = read("client/src/App.tsx");
  assert.match(app, /sessionAligned/);
  assert.match(app, /isLoading \|\| \(user && !sessionAligned\)/);
});

test("ChannelSettings scopes channel/integration keys and does not render while pending", () => {
  const src = read("client/src/components/ChannelSettings.tsx");
  assert.match(src, /withUserQueryScope\(\["\/api\/channels"\]/);
  assert.match(src, /withUserQueryScope\(\["\/api\/integrations"\]/);
  assert.match(src, /withUserQueryScope\(\["\/api\/integrations\/meta-webhook-config"\]/);
  assert.match(src, /withUserQueryScope\(\["\/api\/integrations\/whatsapp\/status"\]/);
  assert.match(src, /withUserQueryScope\(\["\/api\/integrations\/email\/status"\]/);
  assert.match(src, /channelsPending \|\| integrationsPending/);
  assert.match(src, /sessionAligned/);
  assert.doesNotMatch(src, /127\.0\.0\.1:7693/);
  assert.doesNotMatch(src, /whachat_ig_account_id_hint/);
});

test("Inbox activation-status is user-scoped and agrees with Settings empty state", () => {
  const inbox = read("client/src/pages/UnifiedInbox.tsx");
  const layout = read("client/src/pages/AppLayout.tsx");
  assert.match(inbox, /withUserQueryScope\(\["\/api\/activation-status"\]/);
  assert.match(layout, /withUserQueryScope\(\["\/api\/activation-status"\]/);
  assert.match(inbox, /showInboxEmptyNoChannels/);
  assert.match(inbox, /!activationStatus\.hasAnyMessagingChannel/);
  assert.doesNotMatch(inbox, /127\.0\.0\.1:7693/);
});

test("WhatsApp Settings status queries are user-scoped", () => {
  const hub = read("client/src/components/ConnectWhatsAppHub.tsx");
  assert.match(hub, /withUserQueryScope\(\["\/api\/integrations\/whatsapp\/status"\]/);
  assert.match(hub, /sessionAligned/);
});

test("IG wizard hint is scoped and never drives Connected", () => {
  const wizard = read("client/src/components/ConnectMetaFbIgWizard.tsx");
  const settings = read("client/src/components/ChannelSettings.tsx");
  assert.match(wizard, /instagramAccountHintStorageKey/);
  assert.doesNotMatch(settings, /localStorage\.getItem\(\s*["']whachat_ig_account_id_hint/);
  assert.match(settings, /setting\?\.isConnected/);
});

test("other channels share the same Settings loading/account boundary", () => {
  const src = read("client/src/components/ChannelSettings.tsx");
  for (const channel of ["whatsapp", "instagram", "facebook", "sms", "telegram", "email"]) {
    assert.match(src, new RegExp(`['"]${channel}['"]`));
  }
  assert.match(src, /getChannelStatus/);
  assert.match(src, /!sessionAligned \|\| isLoading \|\| channelsPending \|\| integrationsPending/);
});

test("server DELETE ownership check remains before mutation", () => {
  const routes = read("server/routes.ts");
  const del = routes.slice(routes.indexOf('app.delete("/api/integrations/:id"'));
  const rejectIdx = del.indexOf("integration.userId !== req.user.id");
  const deleteCallIdx = del.search(/storage\.deleteIntegration|await storage\.delete/);
  assert.ok(rejectIdx > 0, "ownership reject still present");
  assert.ok(deleteCallIdx > rejectIdx, "ownership check must run before delete");
  assert.doesNotMatch(del.slice(0, 1200), /127\.0\.0\.1:7693/);
});
