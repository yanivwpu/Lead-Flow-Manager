/**
 * Tenant-safe GHL Marketplace UNINSTALL matching.
 *
 * Production location UNINSTALL (GHL AppUninstall contract) often omits companyId:
 * `{ type: "UNINSTALL", appId, locationId }` — parser stores companyId as "unknown".
 * OAuth may persist a Company-token integration with config.locationId empty, plus a
 * company-only marketplace row, while INSTALL created a location marketplace row.
 */

import { isGhlMarketplaceUninstalled } from "./ghlConnectionState";

export type GhlUninstallMatchIdentity = {
  locationId: string | null;
  companyId: string;
  appId: string | null;
};

export type GhlUninstallMarketplaceCandidate = {
  id: string;
  locationId?: string | null;
  companyId?: string | null;
  appId?: string | null;
  versionId?: string | null;
  integrationId?: string | null;
  installationStatus?: string | null;
};

export type GhlUninstallMatchStrategy =
  | "none"
  | "location"
  | "agency"
  | "agency_token"
  | "location_plus_agency_token";

export function isUnknownGhlCompanyId(companyId: string | null | undefined): boolean {
  const value = String(companyId || "").trim().toLowerCase();
  return !value || value === "unknown";
}

export function resolvedGhlCompanyId(
  eventCompanyId: string | null | undefined,
  existingCompanyId: string | null | undefined,
): string {
  if (!isUnknownGhlCompanyId(eventCompanyId)) return String(eventCompanyId).trim();
  if (!isUnknownGhlCompanyId(existingCompanyId)) return String(existingCompanyId).trim();
  const fallback = String(eventCompanyId || existingCompanyId || "").trim();
  return fallback || "unknown";
}

export function marketplaceRowAppIdCompatible(
  rowAppId: string | null | undefined,
  eventAppId: string | null | undefined,
): boolean {
  const row = String(rowAppId || "").trim();
  const event = String(eventAppId || "").trim();
  if (!row || !event) return true;
  return row === event;
}

export function inferGhlUninstallCompanyId(
  event: GhlUninstallMatchIdentity,
  rows: GhlUninstallMarketplaceCandidate[],
): string | null {
  if (!isUnknownGhlCompanyId(event.companyId)) return event.companyId.trim();

  const loc = (event.locationId || "").trim();
  if (loc) {
    for (const row of rows) {
      if ((row.locationId || "").trim() === loc && !isUnknownGhlCompanyId(row.companyId)) {
        return String(row.companyId).trim();
      }
    }
    const locationIntegrationIds = new Set(
      rows
        .filter((row) => (row.locationId || "").trim() === loc && row.integrationId)
        .map((row) => String(row.integrationId)),
    );
    for (const row of rows) {
      if (
        row.integrationId &&
        locationIntegrationIds.has(String(row.integrationId)) &&
        !isUnknownGhlCompanyId(row.companyId)
      ) {
        return String(row.companyId).trim();
      }
    }
  }

  return null;
}

function uniqueById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function selectMarketplaceRowsForUninstall<T extends GhlUninstallMarketplaceCandidate>(
  rows: T[],
  event: GhlUninstallMatchIdentity,
): {
  matches: T[];
  rowsToMarkUninstalled: T[];
  matchStrategy: GhlUninstallMatchStrategy;
  inferredCompanyId: string | null;
  installationCandidates: number;
  retainAgencyToken: boolean;
} {
  const loc = (event.locationId || "").trim() || null;
  const inferredCompanyId = inferGhlUninstallCompanyId(event, rows);
  const appId = (event.appId || "").trim() || null;

  const byLocation = loc
    ? rows.filter(
        (row) =>
          (row.locationId || "").trim() === loc && marketplaceRowAppIdCompatible(row.appId, appId),
      )
    : [];

  const byAgencySibling = inferredCompanyId
    ? rows.filter(
        (row) =>
          !(row.locationId || "").trim() &&
          (row.companyId || "").trim() === inferredCompanyId &&
          marketplaceRowAppIdCompatible(row.appId, appId),
      )
    : [];

  const remainingActiveLocations = inferredCompanyId
    ? rows.filter((row) => {
        const rowLoc = (row.locationId || "").trim();
        if (!rowLoc || (loc && rowLoc === loc)) return false;
        if ((row.companyId || "").trim() !== inferredCompanyId) return false;
        if (!marketplaceRowAppIdCompatible(row.appId, appId)) return false;
        return !isGhlMarketplaceUninstalled(row.installationStatus);
      })
    : [];

  const byAgencyUninstall =
    !loc && inferredCompanyId
      ? rows.filter(
          (row) =>
            (row.companyId || "").trim() === inferredCompanyId &&
            marketplaceRowAppIdCompatible(row.appId, appId),
        )
      : [];

  const matches = uniqueById([...byLocation, ...byAgencySibling, ...byAgencyUninstall]);
  const rowsToMarkUninstalled = uniqueById([
    ...byLocation,
    ...byAgencyUninstall,
    ...(remainingActiveLocations.length === 0 ? byAgencySibling : []),
  ]);

  let matchStrategy: GhlUninstallMatchStrategy = "none";
  if (byLocation.length && byAgencySibling.length) matchStrategy = "location_plus_agency_token";
  else if (byLocation.length) matchStrategy = "location";
  else if (byAgencyUninstall.length) matchStrategy = "agency";
  else if (byAgencySibling.length) matchStrategy = "agency_token";

  return {
    matches,
    rowsToMarkUninstalled,
    matchStrategy,
    inferredCompanyId,
    installationCandidates: matches.length,
    retainAgencyToken: remainingActiveLocations.length > 0,
  };
}

export function selectIntegrationsForUninstall<T extends { id: string; config?: unknown }>(
  integrations: T[],
  event: GhlUninstallMatchIdentity,
  matchedInstalls: GhlUninstallMarketplaceCandidate[],
  inferredCompanyId: string | null,
  options?: { retainAgencyToken?: boolean },
): T[] {
  const loc = (event.locationId || "").trim() || null;
  const eventAppId = (event.appId || "").trim() || null;
  const linkedIds = new Set(
    matchedInstalls.map((row) => row.integrationId).filter((id): id is string => Boolean(id)),
  );
  const matchedLocationIds = new Set(
    matchedInstalls.map((row) => (row.locationId || "").trim()).filter(Boolean),
  );
  const retainAgencyToken = Boolean(options?.retainAgencyToken);

  return integrations.filter((integration) => {
    const cfg = (integration.config || {}) as Record<string, unknown>;
    const cfgLoc = String(cfg.locationId || "").trim();
    const cfgCompany = String(cfg.companyId || "").trim();
    const cfgApp = String(cfg.appId || "").trim();
    if (eventAppId && cfgApp && eventAppId !== cfgApp) return false;

    const isAgencyToken = Boolean(cfgCompany && !cfgLoc);
    if (retainAgencyToken && isAgencyToken) return false;

    if (linkedIds.has(integration.id)) {
      if (retainAgencyToken && isAgencyToken) return false;
      return true;
    }
    if (loc && cfgLoc === loc) return true;
    if (loc && inferredCompanyId && cfgCompany === inferredCompanyId && !cfgLoc) return !retainAgencyToken;
    if (!loc && inferredCompanyId && cfgCompany === inferredCompanyId) {
      if (!cfgLoc) return true;
      return matchedLocationIds.has(cfgLoc);
    }
    return false;
  });
}

export function isGhlTokenIntegrationStaleAfterMarketplaceUninstall(input: {
  integrationId: string;
  configLocationId?: string | null;
  configCompanyId?: string | null;
  marketplaceRows: GhlUninstallMarketplaceCandidate[];
}): boolean {
  const linked = input.marketplaceRows.filter((row) => row.integrationId === input.integrationId);
  const loc = String(input.configLocationId || "").trim();

  if (linked.length === 0) {
    if (!loc) return false;
    const locRows = input.marketplaceRows.filter((row) => (row.locationId || "").trim() === loc);
    return locRows.length > 0 && locRows.every((row) => isGhlMarketplaceUninstalled(row.installationStatus));
  }

  const locationLinked = linked.filter((row) => (row.locationId || "").trim());
  const agencyLinked = linked.filter((row) => !(row.locationId || "").trim());

  if (
    locationLinked.length > 0 &&
    locationLinked.every((row) => isGhlMarketplaceUninstalled(row.installationStatus))
  ) {
    return true;
  }
  if (
    locationLinked.length === 0 &&
    agencyLinked.length > 0 &&
    agencyLinked.every((row) => isGhlMarketplaceUninstalled(row.installationStatus))
  ) {
    return true;
  }
  if (loc) {
    const locRows = input.marketplaceRows.filter((row) => (row.locationId || "").trim() === loc);
    if (locRows.length > 0 && locRows.every((row) => isGhlMarketplaceUninstalled(row.installationStatus))) {
      return true;
    }
  }
  return false;
}
