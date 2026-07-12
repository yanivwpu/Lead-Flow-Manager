/**
 * READ-ONLY forensic: find historical GHL locations and contact counts.
 * Run: npx tsx scripts/forensic-ghl-locations.ts
 * Does NOT modify OAuth, import, or GHL data.
 */
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import {
  contacts,
  ghlMarketplaceInstalls,
  integrations,
  prospectImportJobs,
  users,
} from "../shared/schema";
import { fetchGhlInstalledLocations, getIntegrationById } from "../server/prospectImport/ghlApiClient";
import { getGhlProspectApiToken } from "../server/prospectImport/ghlProspectApiToken";

const TARGET_INTEGRATION_ID = process.env.GHL_FORENSIC_INTEGRATION_ID || "ef5203de-ed3b-40ba-b728-ee115e59c472";

async function main() {
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    sections: {} as Record<string, unknown>,
  };

  // 1. All integrations
  const integrationRows = await db.select().from(integrations).where(eq(integrations.type, "gohighlevel"));
  const integrationReport = [];
  for (const row of integrationRows) {
    const cfg = (row.config || {}) as Record<string, unknown>;
    const owner = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
    integrationReport.push({
      integrationId: row.id,
      userId: row.userId,
      ownerEmail: owner[0]?.email ?? null,
      ownerName: owner[0]?.name ?? null,
      name: row.name,
      isActive: row.isActive,
      userType: cfg.userType ?? null,
      companyId: cfg.companyId ?? null,
      locationId: cfg.locationId ?? null,
      access_token_present: Boolean(row.accessToken),
      refresh_token_present: Boolean(row.refreshToken),
      tokenExpiresAt: row.tokenExpiresAt?.toISOString() ?? null,
      lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
      installedAt: cfg.installedAt ?? null,
      createdAt: row.createdAt?.toISOString() ?? null,
    });
  }
  (report.sections as Record<string, unknown>).integrations = integrationReport;

  // 2. Marketplace installs
  const marketplaceRows = await db.select().from(ghlMarketplaceInstalls).orderBy(ghlMarketplaceInstalls.companyId);
  const marketplaceReport = marketplaceRows.map((r) => {
    const raw = (r.rawPayload || {}) as Record<string, unknown>;
    const hasTokenPayload = Boolean(
      raw.access_token || raw.refresh_token || (raw.token && typeof raw.token === "object"),
    );
    return {
      id: r.id,
      companyId: r.companyId,
      locationId: r.locationId,
      agency: r.agency,
      subAccountName: r.subAccountName,
      agencyEmail: r.agencyEmail,
      agencyOwner: r.agencyOwner,
      status: r.installationStatus,
      source: r.source,
      whachatUserId: r.whachatUserId,
      integrationId: r.integrationId,
      hasTokenPayload,
      installDate: r.installDate?.toISOString() ?? null,
      lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
      createdAt: r.createdAt?.toISOString() ?? null,
    };
  });
  (report.sections as Record<string, unknown>).marketplaceInstalls = marketplaceReport;

  // Unique company/location from marketplace
  const uniqueCompanies = [...new Set(marketplaceRows.map((r) => r.companyId))];
  const uniqueLocations = [...new Set(marketplaceRows.map((r) => r.locationId).filter(Boolean))];
  (report.sections as Record<string, unknown>).marketplaceUnique = {
    companyIds: uniqueCompanies,
    locationIds: uniqueLocations,
    totalRows: marketplaceRows.length,
  };

  // 3. Prospect import jobs
  const importJobs = await db.select().from(prospectImportJobs).orderBy(sql`${prospectImportJobs.createdAt} DESC`);
  (report.sections as Record<string, unknown>).prospectImportJobs = importJobs.map((j) => ({
    id: j.id,
    batchName: j.batchName,
    status: j.status,
    undoStatus: j.undoStatus,
    sourceLocationId: j.sourceLocationId,
    sourceIntegrationId: j.sourceIntegrationId,
    resultImported: j.resultImported,
    resultSkipped: j.resultSkipped,
    createdAt: j.createdAt?.toISOString() ?? null,
    completedAt: j.completedAt?.toISOString() ?? null,
  }));

  // 4. Contacts with GHL evidence — scan all (cap sample for performance)
  const allContacts = await db.select().from(contacts);
  const ghlEvidence = {
    totalContacts: allContacts.length,
    withGhlId: 0,
    sourceGohighlevel: 0,
    sourceImport: 0,
    withProspectImportMeta: 0,
    byLocationId: {} as Record<string, number>,
    byCompanyId: {} as Record<string, number>,
    byGhlLocationInMeta: {} as Record<string, number>,
    byUserId: {} as Record<string, number>,
    sampleGhlIds: [] as string[],
  };

  for (const c of allContacts) {
    if (c.ghlId) {
      ghlEvidence.withGhlId += 1;
      if (ghlEvidence.sampleGhlIds.length < 20) ghlEvidence.sampleGhlIds.push(c.ghlId);
    }
    if (c.source === "gohighlevel") ghlEvidence.sourceGohighlevel += 1;
    if (c.source === "import") ghlEvidence.sourceImport += 1;

    const sd = (c.sourceDetails || {}) as Record<string, unknown>;
    const cf = (c.customFields || {}) as Record<string, unknown>;
    const pi = (sd.prospectImport || cf.prospectImport) as Record<string, unknown> | undefined;

    if (sd.prospectImportProvider || pi) ghlEvidence.withProspectImportMeta += 1;

    const locFromMeta = String(pi?.ghlLocationId || sd.locationId || cfgLoc(sd) || "").trim();
    if (locFromMeta) {
      ghlEvidence.byGhlLocationInMeta[locFromMeta] = (ghlEvidence.byGhlLocationInMeta[locFromMeta] ?? 0) + 1;
    }

    if (c.userId) {
      ghlEvidence.byUserId[c.userId] = (ghlEvidence.byUserId[c.userId] ?? 0) + 1;
    }
  }

  // Resolve user emails for byUserId counts
  const userCounts: { userId: string; email: string | null; count: number }[] = [];
  for (const [userId, count] of Object.entries(ghlEvidence.byUserId)) {
    const u = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    userCounts.push({ userId, email: u[0]?.email ?? null, count });
  }
  userCounts.sort((a, b) => b.count - a.count);

  (report.sections as Record<string, unknown>).contactGhlEvidence = {
    ...ghlEvidence,
    topUsersByContactCount: userCounts.slice(0, 15),
  };

  // 5. Live GHL API — installed locations + contact counts for target integration
  const integration = await getIntegrationById(TARGET_INTEGRATION_ID);
  const liveApi: Record<string, unknown> = { integrationId: TARGET_INTEGRATION_ID, error: null };
  if (!integration?.accessToken) {
    liveApi.error = "Integration not found or missing token";
  } else {
    const cfg = (integration.config || {}) as Record<string, unknown>;
    const companyId = String(cfg.companyId || "").trim();
    liveApi.companyId = companyId;
    liveApi.userType = cfg.userType;

    try {
      const agencyToken = integration.accessToken;
      const locations = await fetchGhlInstalledLocations({ token: agencyToken, companyId });
      liveApi.installedLocationsFromApi = locations;
      liveApi.installedLocationsCount = locations.length;

      const locationCounts: Array<{ locationId: string; name: string; totalContacts: number | null; error?: string }> = [];
      for (const loc of locations) {
        try {
          const resolved = await getGhlProspectApiToken(integration, loc.locationId);
          const resp = await fetch("https://services.leadconnectorhq.com/contacts/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resolved.token}`,
              Version: "2021-07-28",
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ locationId: loc.locationId, page: 1, pageLimit: 1 }),
          });
          const text = await resp.text();
          let data: { total?: number; message?: string } = {};
          try {
            data = JSON.parse(text) as { total?: number; message?: string };
          } catch {
            data = {};
          }
          if (!resp.ok) {
            locationCounts.push({
              locationId: loc.locationId,
              name: loc.name,
              totalContacts: null,
              error: data.message || text.substring(0, 200),
            });
          } else {
            locationCounts.push({
              locationId: loc.locationId,
              name: loc.name,
              totalContacts: typeof data.total === "number" ? data.total : null,
            });
          }
        } catch (err) {
          locationCounts.push({
            locationId: loc.locationId,
            name: loc.name,
            totalContacts: null,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      liveApi.contactCountsPerLocation = locationCounts;
    } catch (err) {
      liveApi.error = err instanceof Error ? err.message : String(err);
    }
  }
  (report.sections as Record<string, unknown>).liveGhlApi = liveApi;

  // 6. Cross-reference: marketplace locations NOT in current company API
  const apiLocationIds = new Set(
    ((liveApi.installedLocationsFromApi as Array<{ locationId: string }>) || []).map((l) => l.locationId),
  );
  const marketplaceNotInApi = marketplaceRows
    .filter((r) => r.locationId && !apiLocationIds.has(r.locationId))
    .map((r) => ({
      companyId: r.companyId,
      locationId: r.locationId,
      subAccountName: r.subAccountName,
      agencyEmail: r.agencyEmail,
      status: r.installationStatus,
      source: r.source,
    }));

  (report.sections as Record<string, unknown>).marketplaceLocationsNotInCurrentOAuthApi = marketplaceNotInApi;

  console.log(JSON.stringify(report, null, 2));
}

function cfgLoc(sd: Record<string, unknown>): string {
  const nested = sd.prospectImport as Record<string, unknown> | undefined;
  return String(nested?.ghlLocationId || "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
