import { eq } from "drizzle-orm";
import type {
  ProspectImportContactFilter,
  ProspectImportLocation,
  ProspectImportPreviewResult,
} from "@shared/prospectImport";
import { ghlMarketplaceInstalls, integrations } from "@shared/schema";
import { db } from "../../../drizzle/db";
import {
  logGhlOAuthDiagnostic,
  summarizeGhlConnectionState,
} from "../../ghlConnectionDiagnostics";
import {
  fetchGhlInstalledLocations,
  fetchGhlLocationTags,
  fetchGhlLocationUsers,
  fetchGhlPipelines,
  getIntegrationById,
  getValidGhlToken,
  isGhlCompanyScopedIntegration,
  readGhlCompanyId,
  readGhlLocationId,
  type GhlRawContact,
} from "../ghlApiClient";
import { getGhlProspectApiToken } from "../ghlProspectApiToken";
import {
  createGhlProspectPreviewJob,
  getGhlProspectPreviewJob,
} from "../prospectImportPreviewService";

type GhlInstalledLocation = { locationId: string; name: string };

async function listMarketplaceLocationsForCompany(companyId: string): Promise<GhlInstalledLocation[]> {
  const rows = await db
    .select({
      locationId: ghlMarketplaceInstalls.locationId,
      subAccountName: ghlMarketplaceInstalls.subAccountName,
      installationStatus: ghlMarketplaceInstalls.installationStatus,
    })
    .from(ghlMarketplaceInstalls)
    .where(eq(ghlMarketplaceInstalls.companyId, companyId));

  const seen = new Set<string>();
  const locations: GhlInstalledLocation[] = [];
  for (const row of rows) {
    const locationId = String(row.locationId || "").trim();
    if (!locationId || seen.has(locationId)) continue;
    if ((row.installationStatus || "").toLowerCase() === "uninstalled") continue;
    seen.add(locationId);
    locations.push({
      locationId,
      name: String(row.subAccountName || locationId).trim() || locationId,
    });
  }
  return locations;
}

async function resolveCompanyScopedLocations(integration: Awaited<ReturnType<typeof getIntegrationById>>): Promise<GhlInstalledLocation[]> {
  if (!integration) return [];
  const companyId = readGhlCompanyId(integration);
  if (!companyId) return [];

  const token = await getValidGhlToken(integration);
  if (token) {
    try {
      const fromApi = await fetchGhlInstalledLocations({ token, companyId });
      if (fromApi.length > 0) return fromApi;
    } catch (err) {
      logGhlOAuthDiagnostic("prospect_import_installed_locations_failed", {
        integrationId: integration.id,
        companyId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return listMarketplaceLocationsForCompany(companyId);
}

export async function listGhlProspectLocations(): Promise<ProspectImportLocation[]> {
  const rows = await db
    .select()
    .from(integrations)
    .where(eq(integrations.type, "gohighlevel"));

  const locations: ProspectImportLocation[] = [];

  for (const integration of rows) {
    if (!integration.isActive || !integration.accessToken) continue;

    const configLocationId = readGhlLocationId(integration);
    if (configLocationId) {
      locations.push({
        id: `${integration.id}:${configLocationId}`,
        integrationId: integration.id,
        name: integration.name,
        locationId: configLocationId,
        isActive: true,
      });
      continue;
    }

    if (!isGhlCompanyScopedIntegration(integration)) continue;

    const companyLocations = await resolveCompanyScopedLocations(integration);
    for (const loc of companyLocations) {
      locations.push({
        id: `${integration.id}:${loc.locationId}`,
        integrationId: integration.id,
        name: loc.name,
        locationId: loc.locationId,
        isActive: true,
      });
    }
  }

  if (locations.length === 0) {
    const summary = await summarizeGhlConnectionState();
    logGhlOAuthDiagnostic("prospect_import_locations_empty", {
      adminRowsTotal: summary.prospectImport.adminRowsTotal,
      eligibleForImport: summary.prospectImport.eligibleForImport,
      ineligibleReasons: summary.prospectImport.ineligibleReasons,
      integrationsWithTokens: summary.integrationsTable.withAccessToken,
      marketplaceActive: summary.marketplaceInstallsTable.active,
      marketplaceMissingIntegrationLink: summary.marketplaceInstallsTable.missingIntegrationLink,
      likelyIssue: summary.likelyIssue,
    });
  }

  return locations;
}

export type GhlLocationMetadata = {
  tags: string[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string; email?: string }[];
};

export async function getGhlLocationMetadata(
  integrationId: string,
  selectedLocationId?: string | null,
): Promise<GhlLocationMetadata> {
  const integration = await getIntegrationById(integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const resolved = await getGhlProspectApiToken(integration, selectedLocationId);

  const [tags, pipelines, users] = await Promise.all([
    fetchGhlLocationTags(resolved.token, resolved.locationId),
    fetchGhlPipelines(resolved.token, resolved.locationId),
    fetchGhlLocationUsers(resolved.token, resolved.locationId),
  ]);
  return { tags, pipelines, users };
}

export async function previewGhlProspectImport(params: {
  integrationId: string;
  locationId?: string | null;
  filters: ProspectImportContactFilter;
  destinationUserId: string;
  initiatedByUserId: string;
  appliedTemplateHint?: string | null;
}): Promise<
  | { mode: "sync"; result: ProspectImportPreviewResult }
  | { mode: "async"; previewJobId: string }
> {
  const outcome = await createGhlProspectPreviewJob({
    integrationId: params.integrationId,
    locationId: params.locationId?.trim() || "",
    filters: params.filters,
    destinationUserId: params.destinationUserId,
    initiatedByUserId: params.initiatedByUserId,
    appliedTemplateHint: params.appliedTemplateHint,
  });

  if (outcome.async) {
    return { mode: "async", previewJobId: outcome.job.id };
  }
  return { mode: "sync", result: outcome.result };
}

export { getGhlProspectPreviewJob };

export function snapshotsToGhlRawContacts(
  snapshots: Array<{
    externalId: string;
    name: string;
    company?: string;
    email?: string;
    phone?: string;
    tags: string[];
    source?: string;
    lastActivity?: string;
  }>,
): GhlRawContact[] {
  return snapshots.map((s) => ({
    id: s.externalId,
    contactName: s.name,
    name: s.name,
    email: s.email,
    phone: s.phone,
    companyName: s.company,
    tags: s.tags,
    source: s.source,
    lastActivity: s.lastActivity,
  }));
}
