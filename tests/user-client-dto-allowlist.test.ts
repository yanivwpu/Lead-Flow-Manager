/**
 * Browser-safe user DTO: never serialize a raw users-row to authenticated clients.
 * Run: npx tsx tests/user-client-dto-allowlist.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  USER_CLIENT_FORBIDDEN_KEYS,
  clientUserForbiddenKeysPresent,
  toAdminUserAttributionDto,
  toClientUser,
} from "../shared/userClientDto";
import { toPublicChannelSetting } from "../shared/integrationPublic";

const root = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

const leakedUserRow = {
  id: "user-1",
  name: "Owner",
  email: "owner@example.test",
  password: "hunter2-secret",
  avatarUrl: "/avatars/1.png",
  language: "en",
  emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletionRequestedAt: null,
  onboardingCompleted: true,
  twilioConnected: true,
  metaConnected: true,
  whatsappProvider: "meta",
  role: "owner",
  metaAccessToken: "enc:meta-token",
  metaAppSecret: "enc:app-secret",
  metaWebhookVerifyToken: "verify-secret",
  telegramWebhookSecret: "tg-secret",
  telegramWebhookPublicId: "tgk_abc",
  tiktokLeadPublicId: "ttk_abc",
  shopifyAccessToken: "shpss_secret",
  twilioAuthToken: "twilio-auth",
  twilioAccountSid: "ACxxxx",
  twilioWhatsappNumber: "+15555550100",
  pushSubscription: { endpoint: "https://push.example/sub" },
  metaLastOAuthDebug: { oauthState: "state-secret", accessToken: "tok" },
  stripeCustomerId: "cus_secret",
  widgetPublicId: "wgt_abc",
  metaPhoneNumberId: "123456",
  metaBusinessAccountId: "waba-1",
  extraFutureColumn: "must-not-leak",
};

{
  const dto = toClientUser(leakedUserRow);
  assert.equal(dto.id, "user-1");
  assert.equal(dto.name, "Owner");
  assert.equal(dto.email, "owner@example.test");
  assert.equal(dto.language, "en");
  assert.equal(dto.twilioConnected, true);
  assert.equal(dto.metaConnected, true);
  assert.equal(dto.whatsappProvider, "meta");
  assert.equal(dto.emailVerifiedAt, "2026-01-01T00:00:00.000Z");
  assert.deepEqual(clientUserForbiddenKeysPresent(dto), []);
  for (const key of USER_CLIENT_FORBIDDEN_KEYS) {
    assert.equal(Object.prototype.hasOwnProperty.call(dto, key), false, `dto must omit ${key}`);
  }
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "extraFutureColumn"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "password"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "metaAccessToken"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "telegramWebhookSecret"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "metaLastOAuthDebug"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dto, "pushSubscription"), false);
}

{
  const admin = toAdminUserAttributionDto({
    ...leakedUserRow,
    source: "partner",
    partnerName: "Acme",
  });
  assert.equal(admin.id, "user-1");
  assert.equal(admin.source, "partner");
  assert.deepEqual(clientUserForbiddenKeysPresent(admin), []);
  assert.equal(Object.prototype.hasOwnProperty.call(admin, "password"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(admin, "shopifyAccessToken"), false);
}

{
  const channel = toPublicChannelSetting({
    id: "ch-1",
    userId: "user-1",
    channel: "facebook",
    isConnected: true,
    isEnabled: true,
    config: {
      pageName: "Acme Page",
      pageId: "page-1",
      accessToken: "EAA-secret",
      webhookVerifyToken: "verify-secret",
      appSecret: "app-secret",
      botToken: "bot-secret",
    },
  });
  assert.equal((channel.config as { pageName: string }).pageName, "Acme Page");
  assert.equal((channel.config as { accessToken?: string }).accessToken, undefined);
  assert.equal((channel.config as { webhookVerifyToken?: string }).webhookVerifyToken, undefined);
  assert.equal((channel.config as { appSecret?: string }).appSecret, undefined);
}

{
  const auth = read("server/auth.ts");
  assert.match(auth, /toClientUser/);
  assert.match(auth, /app\.get\('\/api\/auth\/me'/);
  const me = auth.slice(auth.indexOf("app.get('/api/auth/me'"));
  assert.match(me, /toClientUser\(req\.user/);
  assert.doesNotMatch(me, /password:\s*_/);
  assert.doesNotMatch(auth, /const \{ password: _/);
}

{
  const routes = read("server/routes.ts");
  const prefsGet = routes.slice(routes.indexOf('app.get("/api/users/preferences"'));
  const prefsGetHandler = prefsGet.slice(0, prefsGet.indexOf('app.patch("/api/users/avatar"'));
  assert.match(prefsGetHandler, /pushConfigured/);
  assert.doesNotMatch(prefsGetHandler, /pushSubscription:\s*user\.pushSubscription/);

  const prefsPatch = routes.slice(routes.indexOf('app.patch("/api/users/preferences"'));
  const prefsPatchHandler = prefsPatch.slice(0, prefsPatch.indexOf('app.patch("/api/user/language"'));
  assert.match(prefsPatchHandler, /pushConfigured/);
  assert.doesNotMatch(prefsPatchHandler, /res\.json\(updated\)/);

  const meConnect = routes.slice(routes.indexOf('app.post("/api/meta/connect"'));
  const meConnectHandler = meConnect.slice(0, meConnect.indexOf('app.post("/api/meta/disconnect"'));
  assert.match(meConnectHandler, /webhookVerifyTokenConfigured/);
  assert.doesNotMatch(meConnectHandler, /webhookVerifyToken:\s*updatedUser/);

  const webhookCfg = routes.slice(routes.indexOf('app.get("/api/integrations/meta-webhook-config"'));
  const webhookCfgHandler = webhookCfg.slice(0, webhookCfg.indexOf('app.get("/api/integrations/meta-debug-subscription"'));
  assert.match(webhookCfgHandler, /verifyTokenConfigured/);
  assert.doesNotMatch(webhookCfgHandler, /verifyToken:\s*fbConfig/);
  assert.doesNotMatch(webhookCfgHandler, /verifyToken:\s*igConfig/);

  const attrib = routes.slice(routes.indexOf('app.get("/api/admin/users-attribution"'));
  const attribHandler = attrib.slice(0, attrib.indexOf('app.post("/api/admin/trigger-checkin-emails"'));
  assert.match(attribHandler, /toAdminUserAttributionDto/);
  assert.doesNotMatch(attribHandler, /res\.json\(usersWithAttribution\)/);
}

{
  const channels = read("server/routes/channels.ts");
  assert.match(channels, /toPublicChannelSetting/);
  const getChannels = channels.slice(channels.indexOf('app.get("/api/channels"'));
  const getHandler = getChannels.slice(0, getChannels.indexOf('app.get("/api/channels/whatsapp/availability"'));
  assert.match(getHandler, /toPublicChannelSetting/);
  assert.doesNotMatch(getHandler, /res\.json\(settings\)/);
}

{
  const wa = read("server/routes/whatsappIntegrationRoutes.ts");
  const debugSaved = wa.slice(wa.indexOf('app.get("/api/integrations/whatsapp/meta/debug-saved"'));
  const debugHandler = debugSaved.slice(0, debugSaved.indexOf('app.get("/api/integrations/whatsapp/status"'));
  assert.doesNotMatch(debugHandler, /lastOAuthDebug/);
  assert.doesNotMatch(debugHandler, /metaLastOAuthDebug/);
}

console.log("user-client-dto-allowlist.test.ts: all assertions passed");
