/**
 * Load workspace identity index for Discover-time existing-record matching.
 */
import { eq } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { storage } from "../storage";
import { INCLUDE_INBOX_IDENTITIES } from "@shared/contactCrmVisibility";
import { prospectAiDiscoveryResults } from "@shared/schema";
import {
  buildIdentityKeys,
  classifyIdentityOverlap,
  type ProspectAiIdentityKeys,
  type ProspectAiIdentityMatch,
} from "@shared/prospectAiDiscoveryMatch";

export type WorkspaceIdentityHit = {
  recordId: string;
  recordKind: "crm_contact" | "discovery_result" | "prospect_ai_contact";
  label: string;
  match: ProspectAiIdentityMatch;
  /** Prospect AI lifecycle when record is a PI contact (archived/trashed/deleted). */
  lifecycleStatus?: "active" | "archived" | "trashed" | "deleted";
};

export type DiscoveryWorkspaceIndex = {
  byPlaceId: Map<
    string,
    {
      recordId: string;
      recordKind: WorkspaceIdentityHit["recordKind"];
      label: string;
      lifecycleStatus?: WorkspaceIdentityHit["lifecycleStatus"];
    }
  >;
  entries: Array<{
    recordId: string;
    recordKind: WorkspaceIdentityHit["recordKind"];
    label: string;
    keys: ProspectAiIdentityKeys;
    lifecycleStatus?: WorkspaceIdentityHit["lifecycleStatus"];
  }>;
};

export async function loadDiscoveryWorkspaceIndex(
  workspaceUserId: string,
): Promise<DiscoveryWorkspaceIndex> {
  const byPlaceId = new Map<
    string,
    { recordId: string; recordKind: WorkspaceIdentityHit["recordKind"]; label: string }
  >();
  const entries: DiscoveryWorkspaceIndex["entries"] = [];

  const existingContacts = await storage.getContacts(workspaceUserId, 5000, INCLUDE_INBOX_IDENTITIES);
  const { loadProspectLifecycleByContactIds } = await import(
    "../prospectImport/prospectLifecycleService"
  );
  const lifecycleByContact = await loadProspectLifecycleByContactIds(
    existingContacts.map((c) => c.id),
  );

  for (const c of existingContacts) {
    const sd = (c.sourceDetails || {}) as Record<string, unknown>;
    const cf = (c.customFields || {}) as Record<string, unknown>;
    const pai = (sd.prospectAi || cf.prospectAi || sd.prospectImport || {}) as Record<
      string,
      unknown
    >;
    const placeId = String(pai.placeId || "").trim();
    const label =
      [c.firstName, c.lastName].filter(Boolean).join(" ").trim() ||
      String(c.company || "").trim() ||
      String(c.email || "").trim() ||
      c.id;
    const website = String(pai.website || c.website || "").trim() || null;
    const companyName = String(c.company || pai.name || label).trim();
    const keys = buildIdentityKeys({
      name: companyName,
      providerPlaceId: placeId || null,
      website,
      phone: c.phone,
      email: c.email,
      address: String(pai.address || c.address || "").trim() || null,
    });
    const kind: WorkspaceIdentityHit["recordKind"] =
      String(c.source || "").includes("prospect") || placeId
        ? "prospect_ai_contact"
        : "crm_contact";
    const lifecycleStatus = lifecycleByContact.get(c.id);
    if (placeId && !byPlaceId.has(placeId)) {
      byPlaceId.set(placeId, {
        recordId: c.id,
        recordKind: kind,
        label,
        lifecycleStatus,
      });
    }
    entries.push({
      recordId: c.id,
      recordKind: kind,
      label,
      keys,
      lifecycleStatus,
    });
  }

  // Pending / prior discovery rows (including not-yet-sent Review batch)
  const priorResults = await db
    .select({
      id: prospectAiDiscoveryResults.id,
      providerPlaceId: prospectAiDiscoveryResults.providerPlaceId,
      name: prospectAiDiscoveryResults.name,
      phone: prospectAiDiscoveryResults.phone,
      website: prospectAiDiscoveryResults.website,
      email: prospectAiDiscoveryResults.email,
      address: prospectAiDiscoveryResults.address,
      contactId: prospectAiDiscoveryResults.contactId,
    })
    .from(prospectAiDiscoveryResults)
    .where(eq(prospectAiDiscoveryResults.workspaceUserId, workspaceUserId))
    .limit(8000);

  for (const row of priorResults) {
    const placeId = String(row.providerPlaceId || "").trim();
    const label = String(row.name || "").trim() || row.id;
    const keys = buildIdentityKeys({
      name: row.name,
      providerPlaceId: placeId,
      website: row.website,
      phone: row.phone,
      email: row.email,
      address: row.address,
    });
    if (placeId && !byPlaceId.has(placeId)) {
      byPlaceId.set(placeId, {
        recordId: row.contactId || row.id,
        recordKind: "discovery_result",
        label,
      });
    }
    entries.push({
      recordId: row.contactId || row.id,
      recordKind: "discovery_result",
      label,
      keys,
    });
  }

  return { byPlaceId, entries };
}

export function findWorkspaceMatch(
  index: DiscoveryWorkspaceIndex,
  candidateKeys: ProspectAiIdentityKeys,
  opts?: { allowSoft?: boolean },
): WorkspaceIdentityHit | null {
  if (candidateKeys.placeId) {
    const hit = index.byPlaceId.get(candidateKeys.placeId);
    if (hit) {
      return {
        ...hit,
        match: {
          matchType: "place_id",
          confidence: "exact",
          reason: "Same Google place ID as an existing record",
          autoCollapse: true,
        },
      };
    }
  }

  let bestHard: WorkspaceIdentityHit | null = null;
  let bestSoft: WorkspaceIdentityHit | null = null;
  for (const entry of index.entries) {
    const match = classifyIdentityOverlap(candidateKeys, entry.keys);
    if (!match) continue;
    const hit: WorkspaceIdentityHit = {
      recordId: entry.recordId,
      recordKind: entry.recordKind,
      label: entry.label,
      match,
      lifecycleStatus: entry.lifecycleStatus,
    };
    if (match.autoCollapse) {
      if (
        !bestHard ||
        (match.confidence === "exact" && bestHard.match.confidence !== "exact") ||
        (match.confidence === "high" && bestHard.match.confidence === "likely")
      ) {
        bestHard = hit;
        if (match.confidence === "exact") break;
      }
    } else if (opts?.allowSoft && !bestSoft) {
      bestSoft = hit;
    }
  }
  return bestHard || (opts?.allowSoft ? bestSoft : null);
}
