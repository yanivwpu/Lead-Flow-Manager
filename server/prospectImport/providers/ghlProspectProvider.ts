import { eq } from "drizzle-orm";
import type {
  ProspectImportContactFilter,
  ProspectImportLocation,
  ProspectImportPreviewContact,
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
  normalizeGhlContactName,
  readGhlCompanyId,
  readGhlLocationId,
  searchGhlContacts,
  type GhlRawContact,
} from "../ghlApiClient";
import { getGhlProspectApiToken } from "../ghlProspectApiToken";
import { assembleProspectPreviewResult } from "../prospectImportDedup";
import { storage } from "../../storage";

const DEFAULT_IMPORT_LIMIT = 100;
const MAX_IMPORT_LIMIT = 1000;
const PAGE_SIZE = 100;

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

import {
  contactPassesFilters,
  explainGhlContactFilterRejection,
  sanitizeGhlContactForDiagnostics,
} from "../ghlContactFilters";

function mapRawContact(c: GhlRawContact): Omit<ProspectImportPreviewContact, "isDuplicate" | "duplicateReason"> {
  return {
    externalId: c.id,
    name: normalizeGhlContactName(c),
    company: c.companyName || undefined,
    email: c.email || undefined,
    phone: c.phone || undefined,
    tags: c.tags ?? [],
    source: c.source || undefined,
    lastActivity: c.lastActivity || c.dateUpdated || c.dateAdded || undefined,
  };
}

export async function previewGhlProspectImport(params: {
  integrationId: string;
  locationId?: string | null;
  filters: ProspectImportContactFilter;
  destinationUserId: string;
  appliedTemplateHint?: string | null;
}): Promise<ProspectImportPreviewResult> {
  const integration = await getIntegrationById(params.integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const resolved = await getGhlProspectApiToken(integration, params.locationId);
  const token = resolved.token;
  const locationId = resolved.locationId;

  const limit = Math.min(
    Math.max(params.filters.importLimit ?? DEFAULT_IMPORT_LIMIT, 1),
    MAX_IMPORT_LIMIT,
  );

  const matched: GhlRawContact[] = [];
  let page = 1;
  let totalReported: number | undefined;
  let skippedByFilters = 0;
  const skippedContacts: {
    externalId: string;
    contact: Record<string, unknown>;
    skipReason: string;
  }[] = [];

  while (matched.length < limit) {
    const { contacts, total } = await searchGhlContacts({
      token,
      locationId,
      page,
      pageLimit: PAGE_SIZE,
      query: params.filters.search,
    });
    if (totalReported == null && total != null) totalReported = total;
    if (!contacts.length) break;

    for (const c of contacts) {
      const skipReason = explainGhlContactFilterRejection(c, params.filters);
      if (skipReason) {
        skippedByFilters += 1;
        if (skippedContacts.length < 25) {
          skippedContacts.push({
            externalId: c.id,
            contact: sanitizeGhlContactForDiagnostics(c),
            skipReason,
          });
        }
        continue;
      }
      matched.push(c);
      if (matched.length >= limit) break;
    }

    if (contacts.length < PAGE_SIZE) break;
    page += 1;
    if (page > 50) break;
  }

  if (skippedContacts.length > 0) {
    console.log(
      JSON.stringify({
        tag: "[GHL-ProspectImport-Preview]",
        event: "prospect_import_filter_skips",
        at: new Date().toISOString(),
        integrationId: params.integrationId,
        locationId,
        appliedTemplateHint: params.appliedTemplateHint ?? null,
        activeFilters: params.filters,
        skippedByFilters,
        skippedContacts,
      }),
    );
  }

  const destinationContacts = await storage.getContacts(params.destinationUserId, 50000);

  return assembleProspectPreviewResult({
    rows: matched.map(mapRawContact),
    destinationContacts,
    skippedByFilters,
    totalFound: totalReported ?? matched.length,
    truncated: matched.length >= limit,
    diagnostics: {
      activeFilters: params.filters,
      appliedTemplateHint: params.appliedTemplateHint ?? null,
      skippedContacts,
    },
  });
}

export async function fetchGhlContactsForImport(params: {
  integrationId: string;
  locationId?: string | null;
  filters: ProspectImportContactFilter;
  externalIds?: string[];
}): Promise<GhlRawContact[]> {
  const integration = await getIntegrationById(params.integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const resolved = await getGhlProspectApiToken(integration, params.locationId);
  const token = resolved.token;
  const locationId = resolved.locationId;

  const selected = new Set(params.externalIds ?? []);
  const useSelection = selected.size > 0;

  const limit = useSelection
    ? selected.size
    : Math.min(Math.max(params.filters.importLimit ?? DEFAULT_IMPORT_LIMIT, 1), MAX_IMPORT_LIMIT);

  const matched: GhlRawContact[] = [];
  let page = 1;

  while (matched.length < limit) {
    const { contacts } = await searchGhlContacts({
      token,
      locationId,
      page,
      pageLimit: PAGE_SIZE,
      query: params.filters.search,
    });
    if (!contacts.length) break;

    for (const c of contacts) {
      if (useSelection && !selected.has(c.id)) continue;
      if (!useSelection && !contactPassesFilters(c, params.filters)) continue;
      matched.push(c);
      if (matched.length >= limit) break;
      if (useSelection && matched.length >= selected.size) break;
    }

    if (contacts.length < PAGE_SIZE) break;
    if (useSelection && matched.length >= selected.size) break;
    page += 1;
    if (page > 50) break;
  }

  return matched;
}
