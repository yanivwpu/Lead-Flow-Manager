/**
 * Controlled GHL Marketplace Reconnect (no uninstall, no browser OAuth).
 * Never prints secrets/tokens/authorization codes.
 *
 * Run: npx tsx scripts/run-ghl-oauth-reconnect.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls, integrations } from "../shared/schema";
import { reconnectGhlMarketplaceOAuth } from "../server/ghlOAuthReconnect";
import { redactSecretsInText } from "../shared/integrationPublic";

const TARGET_LOCATION = "EOFOVqrgSM7x1c2WAV4m"; // WhaChatCRM / Winter Garden sub-account
const TARGET_COMPANY = "Jyk3C3jKACswbgW8duhg";

async function main() {
  const ghlRows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const integration = ghlRows.find((r) => {
    const cfg = (r.config || {}) as Record<string, unknown>;
    return cfg.companyId === TARGET_COMPANY;
  });

  if (!integration) {
    console.log(JSON.stringify({ ok: false, error: "no_matching_integration" }));
    process.exit(1);
  }

  const cfg = (integration.config || {}) as Record<string, unknown>;
  const marketplace = await db
    .select()
    .from(ghlMarketplaceInstalls)
    .where(eq(ghlMarketplaceInstalls.locationId, TARGET_LOCATION))
    .limit(1);

  const mp = marketplace[0];

  const decision = {
    subAccount: mp?.subAccountName ?? "WhaChatCRM",
    locationId: TARGET_LOCATION,
    companyId: TARGET_COMPANY,
    integrationIdPrefix: integration.id.slice(0, 8),
    tokenUserType: cfg.userType ?? null,
    /** Agency-scoped tokens → reconnect with companyId first (GHL Agency connections). */
    primaryReconnectMode: "company" as const,
    fallbackReconnectMode: "location" as const,
    why:
      "Existing integration userType is Company with companyId set and locationId null on the token row. GHL Reconnect API uses companyId for Agency connections. Location EOFOVqrg… is the Active WhaChatCRM sub-account install (fallback).",
  };

  console.log(
    JSON.stringify(
      {
        phase: "decision",
        ...decision,
        marketplaceStatus: mp?.installationStatus ?? null,
        marketplaceLinked: mp?.integrationId === integration.id,
      },
      null,
      2,
    ),
  );

  const redirectUri =
    String(process.env.GHL_REDIRECT_URI || "").trim() ||
    "https://app.whachatcrm.com/api/ext/callback";

  let result = await reconnectGhlMarketplaceOAuth({
    ownerUserId: integration.userId,
    scope: { mode: "company", companyId: TARGET_COMPANY, locationId: TARGET_LOCATION },
    redirectUri,
  });

  if (!result.ok && result.stage === "reconnect_api") {
    console.log(
      JSON.stringify({
        phase: "company_reconnect_failed_trying_location",
        error: result.error,
        httpStatus: result.httpStatus,
      }),
    );
    result = await reconnectGhlMarketplaceOAuth({
      ownerUserId: integration.userId,
      scope: { mode: "location", locationId: TARGET_LOCATION, companyId: TARGET_COMPANY },
      redirectUri,
    });
  }

  const safe = {
    phase: "result",
    ok: result.ok,
    stage: result.stage,
    reconnectMode: result.reconnectMode,
    locationId: result.locationId,
    companyId: result.companyId,
    integrationIdPrefix: result.integrationId?.slice(0, 8) ?? null,
    integrationUpdated: result.integrationUpdated,
    integrationCreated: result.integrationCreated,
    probeOk: result.probeOk,
    refreshOk: result.refreshOk,
    tokenExpiresAt: result.tokenExpiresAt,
    userType: result.userType,
    httpStatus: result.httpStatus ?? null,
    error: result.error ?? null,
  };

  console.log(redactSecretsInText(JSON.stringify(safe, null, 2)));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(redactSecretsInText(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
