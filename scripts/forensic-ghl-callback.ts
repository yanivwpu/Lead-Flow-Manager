/**
 * Forensic: did GHL OAuth callback or INSTALL webhook ever run? (no tokens printed)
 * Run: npx tsx scripts/forensic-ghl-callback.ts
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { ghlMarketplaceInstalls, integrations } from "@shared/schema";

function payloadSummary(raw: unknown): {
  keys: string[];
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  userType: string | null;
  locationId: string | null;
  companyId: string | null;
  type: string | null;
  installType: string | null;
  webhookId: string | null;
} {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    keys: Object.keys(p).sort(),
    hasAccessToken: Boolean(p.access_token),
    hasRefreshToken: Boolean(p.refresh_token),
    userType: typeof p.userType === "string" ? p.userType : null,
    locationId: typeof p.locationId === "string" ? p.locationId : null,
    companyId: typeof p.companyId === "string" ? p.companyId : null,
    type: typeof p.type === "string" ? p.type : null,
    installType: typeof p.installType === "string" ? p.installType : null,
    webhookId: typeof p.webhookId === "string" ? p.webhookId : null,
  };
}

async function main() {
  const ghlIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const marketplaceRows = await db.select().from(ghlMarketplaceInstalls);

  const bySource = new Map<string, typeof marketplaceRows>();
  for (const row of marketplaceRows) {
    const src = row.source || "unknown";
    const list = bySource.get(src) || [];
    list.push(row);
    bySource.set(src, list);
  }

  console.log("\n=== GHL callback / webhook forensic ===\n");

  console.log("integrations (type=gohighlevel) — all time:");
  console.log(
    JSON.stringify(
      {
        total: ghlIntegrations.length,
        withAccessToken: ghlIntegrations.filter((r) => Boolean(r.accessToken)).length,
        rows: ghlIntegrations.map((r) => ({
          id: r.id,
          userId: r.userId,
          isActive: r.isActive,
          hasAccessToken: Boolean(r.accessToken),
          hasRefreshToken: Boolean(r.refreshToken),
          createdAt: r.createdAt?.toISOString() ?? null,
          locationId: ((r.config || {}) as Record<string, unknown>).locationId ?? null,
          companyId: ((r.config || {}) as Record<string, unknown>).companyId ?? null,
        })),
      },
      null,
      2,
    ),
  );

  console.log("\nghl_marketplace_installs by source:");
  for (const [source, rows] of [...bySource.entries()].sort()) {
    console.log(`\n--- source: ${source} (${rows.length} rows) ---`);
    for (const row of rows.sort((a, b) => {
      const at = (a.createdAt || a.installDate || new Date(0)).getTime();
      const bt = (b.createdAt || b.installDate || new Date(0)).getTime();
      return at - bt;
    })) {
      const summary = payloadSummary(row.rawPayload);
      console.log(
        JSON.stringify(
          {
            id: row.id,
            companyId: row.companyId,
            locationId: row.locationId,
            installationStatus: row.installationStatus,
            integrationId: row.integrationId,
            whachatUserId: row.whachatUserId,
            installDate: row.installDate?.toISOString() ?? null,
            createdAt: row.createdAt?.toISOString() ?? null,
            updatedAt: row.updatedAt?.toISOString() ?? null,
            rawPayload: summary,
          },
          null,
          2,
        ),
      );
    }
  }

  const oauthRows = marketplaceRows.filter((r) => r.source === "oauth");
  const webhookRows = marketplaceRows.filter((r) => r.source === "webhook");
  const csvRows = marketplaceRows.filter((r) => r.source === "csv");

  console.log("\n=== Interpretation ===\n");

  if (oauthRows.length > 0) {
    const withTokenPayload = oauthRows.filter((r) => payloadSummary(r.rawPayload).hasAccessToken);
    const withoutTokenPayload = oauthRows.filter((r) => !payloadSummary(r.rawPayload).hasAccessToken);
    console.log(`OAuth-source marketplace rows: ${oauthRows.length}`);
    console.log(`  - rawPayload contains access_token (callback token exchange ran): ${withTokenPayload.length}`);
    console.log(`  - rawPayload without access_token: ${withoutTokenPayload.length}`);
    if (withTokenPayload.length > 0 && ghlIntegrations.length === 0) {
      console.log(
        "  → LIKELY: /api/ext/callback received code + exchanged tokens, but integrations row NOT created (callback_no_session_user path).",
      );
    }
  } else {
    console.log("No marketplace rows with source=oauth — /api/ext/callback may never have completed token exchange.");
  }

  if (webhookRows.length > 0) {
    console.log(`\nWebhook-source marketplace rows: ${webhookRows.length}`);
    console.log("  → INSTALL webhook fired; webhooks never create OAuth tokens or integrations rows.");
  }

  if (csvRows.length > 0) {
    console.log(`\nCSV-import marketplace rows: ${csvRows.length} (manual backfill — not from live callback/webhook).`);
  }

  const installWebhookEvidence = marketplaceRows.filter(
    (r) => payloadSummary(r.rawPayload).type === "INSTALL" || payloadSummary(r.rawPayload).type === "AppInstall",
  );
  if (installWebhookEvidence.length > 0) {
    console.log(`\nRows with INSTALL webhook payload shape: ${installWebhookEvidence.length}`);
  }

  console.log("\nGHL Marketplace install does NOT guarantee redirect to redirect_uri:");
  console.log("  - INSTALL webhook → records ghl_marketplace_installs only");
  console.log("  - OAuth redirect with ?code= → required for integrations.access_token");
  console.log("  - Paid/freemium apps may complete install inside GHL without external OAuth callback\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
