import type {
  ProspectImportContactFilter,
  ProspectImportLocation,
  ProspectImportPreviewContact,
  ProspectImportPreviewResult,
} from "@shared/prospectImport";
import { listGhlInstallationsForAdmin } from "../../ghlMarketplaceService";
import {
  fetchGhlLocationTags,
  fetchGhlLocationUsers,
  fetchGhlPipelines,
  getIntegrationById,
  getValidGhlToken,
  normalizeGhlContactName,
  readGhlLocationId,
  searchGhlContacts,
  type GhlRawContact,
} from "../ghlApiClient";
import { assembleProspectPreviewResult } from "../prospectImportDedup";
import { storage } from "../../storage";

const DEFAULT_IMPORT_LIMIT = 100;
const MAX_IMPORT_LIMIT = 1000;
const PAGE_SIZE = 100;

export async function listGhlProspectLocations(): Promise<ProspectImportLocation[]> {
  const rows = await listGhlInstallationsForAdmin();
  return rows
    .filter((r) => r.isActive && r.integrationId && r.locationId && r.locationId !== "Unknown")
    .map((r) => ({
      id: r.integrationId!,
      integrationId: r.integrationId!,
      name: r.subAccountName || r.agency || r.locationId,
      locationId: r.locationId,
      isActive: r.isActive,
    }));
}

export type GhlLocationMetadata = {
  tags: string[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  users: { id: string; name: string; email?: string }[];
};

export async function getGhlLocationMetadata(integrationId: string): Promise<GhlLocationMetadata> {
  const integration = await getIntegrationById(integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const token = await getValidGhlToken(integration);
  const locationId = readGhlLocationId(integration);
  if (!token || !locationId) throw new Error("GHL token or location unavailable");

  const [tags, pipelines, users] = await Promise.all([
    fetchGhlLocationTags(token, locationId),
    fetchGhlPipelines(token, locationId),
    fetchGhlLocationUsers(token, locationId),
  ]);
  return { tags, pipelines, users };
}

function parseDate(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function contactPassesFilters(c: GhlRawContact, filters: ProspectImportContactFilter): boolean {
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());
  if (filters.tags?.length) {
    const wanted = filters.tags.map((t) => t.toLowerCase());
    if (!wanted.some((t) => tags.includes(t))) return false;
  }

  if (filters.contactSource?.trim()) {
    const src = String(c.source || "").toLowerCase();
    if (!src.includes(filters.contactSource.trim().toLowerCase())) return false;
  }

  if (filters.assignedUserId?.trim() && c.assignedTo !== filters.assignedUserId.trim()) {
    return false;
  }

  const created = parseDate(c.dateAdded);
  if (filters.createdAfter && created) {
    const after = new Date(filters.createdAfter);
    if (created < after) return false;
  }
  if (filters.createdBefore && created) {
    const before = new Date(filters.createdBefore);
    if (created > before) return false;
  }

  if (filters.lastActivityDays) {
    const activity = parseDate(c.lastActivity || c.dateUpdated || c.dateAdded);
    if (activity) {
      const cutoff = Date.now() - filters.lastActivityDays * 24 * 60 * 60 * 1000;
      if (activity.getTime() < cutoff) return false;
    }
  }

  const hasEmail = Boolean(String(c.email || "").trim());
  const hasPhone = Boolean(String(c.phone || "").replace(/\D/g, "").length >= 7);
  if (filters.hasBoth && !(hasEmail && hasPhone)) return false;
  if (filters.hasEmail && !hasEmail) return false;
  if (filters.hasPhone && !hasPhone) return false;

  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    const hay = [
      normalizeGhlContactName(c),
      c.companyName,
      c.email,
      c.phone,
      ...(c.tags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }

  return true;
}

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
  filters: ProspectImportContactFilter;
  destinationUserId: string;
}): Promise<ProspectImportPreviewResult> {
  const integration = await getIntegrationById(params.integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const token = await getValidGhlToken(integration);
  const locationId = readGhlLocationId(integration);
  if (!token || !locationId) throw new Error("GHL token or location unavailable");

  const limit = Math.min(
    Math.max(params.filters.importLimit ?? DEFAULT_IMPORT_LIMIT, 1),
    MAX_IMPORT_LIMIT,
  );

  const matched: GhlRawContact[] = [];
  let page = 1;
  let totalReported: number | undefined;
  let skippedByFilters = 0;

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
      if (!contactPassesFilters(c, params.filters)) {
        skippedByFilters += 1;
        continue;
      }
      matched.push(c);
      if (matched.length >= limit) break;
    }

    if (contacts.length < PAGE_SIZE) break;
    page += 1;
    if (page > 50) break;
  }

  const destinationContacts = await storage.getContacts(params.destinationUserId, 50000);

  return assembleProspectPreviewResult({
    rows: matched.map(mapRawContact),
    destinationContacts,
    skippedByFilters,
    totalFound: totalReported ?? matched.length,
    truncated: matched.length >= limit,
  });
}

export async function fetchGhlContactsForImport(params: {
  integrationId: string;
  filters: ProspectImportContactFilter;
  externalIds?: string[];
}): Promise<GhlRawContact[]> {
  const integration = await getIntegrationById(params.integrationId);
  if (!integration?.isActive) throw new Error("GHL integration not found or inactive");
  const token = await getValidGhlToken(integration);
  const locationId = readGhlLocationId(integration);
  if (!token || !locationId) throw new Error("GHL token or location unavailable");

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
