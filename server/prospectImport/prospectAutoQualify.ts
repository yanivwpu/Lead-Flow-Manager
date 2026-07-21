/**
 * Auto-enqueue lightweight AI qualification for newly entered prospects.
 * Used after Discover → Review and after GHL/internal import — never requires a manual Analyze click.
 */

import { prospectIntelligence } from "@shared/schema";
import { db } from "../../drizzle/db";
import { createBulkAnalysisJob } from "./prospectBulkAnalysisService";

export async function ensurePendingIntelligenceRows(contactIds: string[]): Promise<void> {
  const ids = [...new Set(contactIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return;
  const now = new Date();
  for (const contactId of ids) {
    await db
      .insert(prospectIntelligence)
      .values({
        contactId,
        analysisStatus: "pending",
        reviewStatus: "pending",
        needsReview: false,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: prospectIntelligence.contactId });
  }
}

/**
 * Seed intelligence rows (if needed) and enqueue durable bulk qualification.
 * Returns null when there is nothing to analyze.
 */
export async function enqueueProspectAutoQualification(params: {
  contactIds: string[];
  workspaceUserId: string;
  initiatedByUserId?: string;
}): Promise<{ analysisStarted: boolean; analysisJobId: string | null }> {
  const ids = [...new Set(params.contactIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) {
    return { analysisStarted: false, analysisJobId: null };
  }

  await ensurePendingIntelligenceRows(ids);

  try {
    const job = await createBulkAnalysisJob({
      contactIds: ids,
      initiatedByUserId: params.initiatedByUserId || params.workspaceUserId,
      workspaceUserId: params.workspaceUserId,
      selectionMode: "selected",
    });
    return { analysisStarted: true, analysisJobId: job.id };
  } catch (err) {
    console.error(
      "[ProspectAutoQualify] Failed to enqueue qualification:",
      err instanceof Error ? err.message : err,
    );
    return { analysisStarted: false, analysisJobId: null };
  }
}
