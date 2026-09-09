/**
 * GET /api/integrations must never expose raw tokens.
 * Run: npx tsx tests/integration-public-redaction.test.ts
 */
import assert from "node:assert/strict";
import { toPublicIntegration, redactSecretsInText, toPublicChannelSetting } from "../shared/integrationPublic";

{
  const pub = toPublicIntegration({
    id: "abc",
    type: "gohighlevel",
    accessToken: "secret-access",
    refreshToken: "secret-refresh",
    config: { locationId: "loc1", accessToken: "nested-secret", companyId: "co1" },
    isActive: true,
  });
  assert.equal((pub as { accessToken?: string }).accessToken, undefined);
  assert.equal((pub as { refreshToken?: string }).refreshToken, undefined);
  assert.equal((pub as { hasAccessToken?: boolean }).hasAccessToken, true);
  assert.equal((pub as { hasRefreshToken?: boolean }).hasRefreshToken, true);
  assert.equal((pub.config as { accessToken: string }).accessToken, "••••••••");
  assert.equal((pub.config as { locationId: string }).locationId, "loc1");
}

{
  const redacted = redactSecretsInText(
    JSON.stringify({ access_token: "tokXYZ", refresh_token: "refXYZ", authorizationCode: "authXYZ" }),
  );
  assert.ok(!redacted.includes("tokXYZ"));
  assert.ok(!redacted.includes("refXYZ"));
  assert.ok(!redacted.includes("authXYZ"));
  assert.ok(redacted.includes("[REDACTED]"));
}

{
  const channel = toPublicChannelSetting({
    id: "ch-1",
    config: { pageName: "Page", accessToken: "secret", webhookVerifyToken: "vt" },
  });
  assert.equal((channel.config as { pageName: string }).pageName, "Page");
  assert.equal((channel.config as { accessToken?: string }).accessToken, undefined);
  assert.equal((channel.config as { webhookVerifyToken?: string }).webhookVerifyToken, undefined);
}

console.log("integration-public-redaction.test.ts: all assertions passed");
