/**
 * Resolve Prospect Engine bulk selection server-side.
 * allFiltered never trusts browser-loaded rows.
 */

import type { ProspectIntelligenceListFilters } from "@shared/prospectImport";
import {
  PROSPECT_BULK_MAX_BATCH_SIZE,
  type ProspectBulkSelectionRequest,
  type ProspectBulkSelectionResult,
} from "@shared/prospectBulkSelection";
import { listProspectIntelligence } from "./prospectIntelligenceService";
import { resolveProspectImportDestinationUserId } from "./prospectImportService";
import { storage } from "../storage";
import { isInternalImportedProspect } from "./prospectIntelligenceEligibility";

export class ProspectBulkSelectionError extends Error {
  constructor(
    message: string,
    public readonly code: "empty" | "over_limit" | "invalid",
    public readonly matchedCount?: number,
  ) {
    super(message);
    this.name = "ProspectBulkSelectionError";
  }
}

async function scopedContactIds(
  workspaceUserId: string,
  contactIds: string[],
): Promise<string[]> {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of contactIds) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const contact = await storage.getContact(id);
    if (!contact) continue;
    if (contact.userId !== workspaceUserId) continue;
    if (!isInternalImportedProspect(contact)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Resolve exact contact IDs for Analyze / Approve / Queue.
 * Throws ProspectBulkSelectionError when over max (no silent truncate).
 */
export async function resolveProspectBulkSelection(
  params: ProspectBulkSelectionRequest & { workspaceUserId?: string },
): Promise<ProspectBulkSelectionResult> {
  const workspaceUserId =
    params.workspaceUserId || (await resolveProspectImportDestinationUserId());
  const maxBatchSize = PROSPECT_BULK_MAX_BATCH_SIZE;

  if (params.allFiltered) {
    const filters: ProspectIntelligenceListFilters = { ...(params.filters || {}) };
    // Fetch one past max to detect over-limit without pretending we process them all.
    const items = await listProspectIntelligence({
      ...filters,
      limit: maxBatchSize + 1,
    });
    const matchedCount = items.length;
    if (matchedCount === 0) {
      throw new ProspectBulkSelectionError("No prospects match the current filters.", "empty");
    }
    if (matchedCount > maxBatchSize) {
      throw new ProspectBulkSelectionError(
        `Filtered set exceeds the maximum batch size of ${maxBatchSize}. Narrow your filters and try again.`,
        "over_limit",
        matchedCount,
      );
    }
    // Re-scope via contact ownership (list already workspace-scoped via destination user).
    const contactIds = await scopedContactIds(
      workspaceUserId,
      items.map((i) => i.contactId),
    );
    if (!contactIds.length) {
      throw new ProspectBulkSelectionError("No prospects match the current filters.", "empty");
    }
    return {
      contactIds,
      count: contactIds.length,
      selectionMode: "filtered",
      truncated: false,
      maxBatchSize,
      matchedCount: contactIds.length,
      filters,
    };
  }

  const rawIds = Array.isArray(params.contactIds) ? params.contactIds : [];
  if (!rawIds.length) {
    throw new ProspectBulkSelectionError("No prospects selected.", "empty");
  }
  if (rawIds.length > maxBatchSize) {
    throw new ProspectBulkSelectionError(
      `Selection exceeds the maximum batch size of ${maxBatchSize}.`,
      "over_limit",
      rawIds.length,
    );
  }
  const contactIds = await scopedContactIds(workspaceUserId, rawIds);
  if (!contactIds.length) {
    throw new ProspectBulkSelectionError(
      "No valid workspace prospects in selection.",
      "empty",
    );
  }
  return {
    contactIds,
    count: contactIds.length,
    selectionMode: "selected",
    truncated: false,
    maxBatchSize,
    matchedCount: contactIds.length,
  };
}
