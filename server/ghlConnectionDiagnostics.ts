import { eq } from "drizzle-orm";
import { ghlMarketplaceInstalls, integrations } from "@shared/schema";
import { db } from "../drizzle/db";
import { listGhlInstallationsForAdmin } from "./ghlMarketplaceService";

export type GhlOAuthDiagnosticEvent =
  | "callback_received"
  | "callback_oauth_error"
  | "callback_missing_code"
  | "callback_token_exchange_failed"
  | "callback_token_exchange_ok"
  | "callback_no_session_user"
  | "callback_integration_updated"
  | "callback_integration_created"
  | "callback_marketplace_upserted"
  | "callback_completed"
  | "callback_failed"
  | "webhook_install_received"
  | "webhook_install_marketplace_upserted"
  | "webhook_install_integration_linked"
  | "webhook_install_no_integration"
  | "prospect_import_locations_empty";

export type UnlinkedGhlMarketplaceInstall = {
  id: string;
  locationId: string | null;
  companyId: string;
  subAccountName: string | null;
  agency: string | null;
  installationStatus: string | null;
  source: string | null;
};

export async function listUnlinkedActiveGhlMarketplaceInstalls(): Promise<UnlinkedGhlMarketplaceInstall[]> {
  const marketplaceRows = await db.select().from(ghlMarketplaceInstalls);
  return marketplaceRows
    .filter(
      (r) =>
        (r.installationStatus || "").toLowerCase() !== "uninstalled" &&
        !r.integrationId,
    )
    .map((r) => ({
      id: r.id,
      locationId: r.locationId,
      companyId: r.companyId,
      subAccountName: r.subAccountName,
      agency: r.agency,
      installationStatus: r.installationStatus,
      source: r.source,
    }));
}

export function logGhlOAuthDiagnostic(
  event: GhlOAuthDiagnosticEvent,
  data: Record<string, unknown>,
): void {
  console.log(
    JSON.stringify({
      tag: "[GHL-OAuth-Diagnostic]",
      event,
      at: new Date().toISOString(),
      ...data,
    }),
  );
}

/** Read-only snapshot for logs / scripts — never includes tokens. */
export async function summarizeGhlConnectionState(): Promise<{
  integrationsTable: {
    total: number;
    active: number;
    withAccessToken: number;
    withRefreshToken: number;
    byUserId: { userId: string; count: number; hasToken: boolean; locationId: string | null }[];
  };
  marketplaceInstallsTable: {
    total: number;
    active: number;
    linkedToIntegration: number;
    missingIntegrationLink: number;
    missingTokensNote: string;
    rows: {
      id: string;
      locationId: string | null;
      companyId: string;
      installationStatus: string | null;
      integrationId: string | null;
      whachatUserId: string | null;
      source: string | null;
    }[];
  };
  prospectImport: {
    adminRowsTotal: number;
    eligibleForImport: number;
    ineligibleReasons: { reason: string; count: number }[];
  };
  likelyIssue: string | null;
}> {
  const ghlIntegrations = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const marketplaceRows = await db.select().from(ghlMarketplaceInstalls);
  const adminRows = await listGhlInstallationsForAdmin();

  const byUser = new Map<string, { count: number; hasToken: boolean; locationId: string | null }>();
  for (const row of ghlIntegrations) {
    const cfg = (row.config || {}) as Record<string, unknown>;
    const prev = byUser.get(row.userId) || { count: 0, hasToken: false, locationId: null };
    byUser.set(row.userId, {
      count: prev.count + 1,
      hasToken: prev.hasToken || Boolean(row.accessToken),
      locationId: (cfg.locationId as string) || prev.locationId,
    });
  }

  const activeMarketplace = marketplaceRows.filter(
    (r) => (r.installationStatus || "").toLowerCase() !== "uninstalled",
  );
  const missingLink = activeMarketplace.filter((r) => !r.integrationId);

  const ineligible = new Map<string, number>();
  for (const row of adminRows) {
    if (!row.isActive) {
      ineligible.set("not_active", (ineligible.get("not_active") ?? 0) + 1);
      continue;
    }
    if (!row.integrationId) {
      ineligible.set("no_integration_row_or_tokens", (ineligible.get("no_integration_row_or_tokens") ?? 0) + 1);
      continue;
    }
    if (!row.locationId || row.locationId === "Unknown") {
      ineligible.set("missing_location_id", (ineligible.get("missing_location_id") ?? 0) + 1);
      continue;
    }
  }

  const eligible = adminRows.filter(
    (r) => r.isActive && r.integrationId && r.locationId && r.locationId !== "Unknown",
  );

  let likelyIssue: string | null = null;
  if (eligible.length === 0) {
    if (ghlIntegrations.length === 0 && activeMarketplace.length > 0) {
      likelyIssue =
        "Marketplace install exists in ghl_marketplace_installs but no integrations row (type=gohighlevel) with OAuth tokens — OAuth callback likely never completed or ran without a logged-in WhachatCRM session.";
    } else if (ghlIntegrations.length > 0 && ghlIntegrations.every((i) => !i.accessToken)) {
      likelyIssue = "integrations rows exist but access_token is missing on all gohighlevel records.";
    } else if (missingLink.length > 0 && ghlIntegrations.length === 0) {
      likelyIssue =
        "ghl_marketplace_installs has active installs not linked to integrations — INSTALL webhook fired but OAuth token exchange did not create an integration.";
    } else if (eligible.length === 0 && ghlIntegrations.length > 0) {
      likelyIssue = "integrations exist but none pass Prospect Import filters (active + integrationId + valid locationId).";
    }
  }

  return {
    integrationsTable: {
      total: ghlIntegrations.length,
      active: ghlIntegrations.filter((i) => i.isActive).length,
      withAccessToken: ghlIntegrations.filter((i) => Boolean(i.accessToken)).length,
      withRefreshToken: ghlIntegrations.filter((i) => Boolean(i.refreshToken)).length,
      byUserId: [...byUser.entries()].map(([userId, v]) => ({ userId, ...v })),
    },
    marketplaceInstallsTable: {
      total: marketplaceRows.length,
      active: activeMarketplace.length,
      linkedToIntegration: activeMarketplace.filter((r) => r.integrationId).length,
      missingIntegrationLink: missingLink.length,
      missingTokensNote:
        "ghl_marketplace_installs never stores OAuth tokens; API access requires integrations.access_token from OAuth callback.",
      rows: marketplaceRows.map((r) => ({
        id: r.id,
        locationId: r.locationId,
        companyId: r.companyId,
        installationStatus: r.installationStatus,
        integrationId: r.integrationId,
        whachatUserId: r.whachatUserId,
        source: r.source,
      })),
    },
    prospectImport: {
      adminRowsTotal: adminRows.length,
      eligibleForImport: eligible.length,
      ineligibleReasons: [...ineligible.entries()].map(([reason, count]) => ({ reason, count })),
    },
    likelyIssue,
  };
}
