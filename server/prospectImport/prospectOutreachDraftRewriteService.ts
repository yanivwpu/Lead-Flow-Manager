/**
 * Apply Campaign AI Instructions as a rewrite layer on queued draft snapshots.
 * Always preserves Platform Outreach Writing Standard quality.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { contacts, prospectIntelligence, prospectOutreachQueueItems } from "@shared/schema";
import type { ProspectOutreachInstructions } from "@shared/prospectOutreachInstructions";
import {
  buildOutreachDraftRewriteSystemPrompt,
  buildOutreachDraftRewriteUserPrompt,
  parseOutreachDraftRewriteResponse,
} from "@shared/prospectOutreachDraftRewrite";
import {
  formatOutreachProspectIntelligenceForPrompt,
  formatOutreachSenderContextForPrompt,
} from "@shared/prospectOutreachWritingStandard";
import { aiProvider } from "../aiProvider";
import { loadProspectAiWorkspaceContext } from "./prospectAiWorkspaceContext";

const REWRITE_CONCURRENCY = 3;

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()),
  );
  return out;
}

export async function rewriteQueuedOutreachDrafts(params: {
  workspaceUserId: string;
  instructions: ProspectOutreachInstructions;
  batchId?: string | null;
  /** When set, only rewrite these queue item ids (still must be queued/paused). */
  itemIds?: string[] | null;
}): Promise<{ rewritten: number; skipped: number; failed: number }> {
  // Instructions save: only unsent drafts. Targeted regenerate may also refresh failed rows.
  const editableStatuses =
    params.itemIds && params.itemIds.length > 0
      ? (["queued", "paused", "failed"] as const)
      : (["queued", "paused"] as const);
  const conditions = [
    eq(prospectOutreachQueueItems.workspaceUserId, params.workspaceUserId),
    inArray(prospectOutreachQueueItems.queueStatus, [...editableStatuses]),
  ];
  if (params.batchId) {
    conditions.push(eq(prospectOutreachQueueItems.batchId, params.batchId));
  }
  if (params.itemIds && params.itemIds.length > 0) {
    conditions.push(inArray(prospectOutreachQueueItems.id, Array.from(new Set(params.itemIds))));
  }

  const rows = await db
    .select({
      item: prospectOutreachQueueItems,
      name: contacts.name,
      companyName: prospectIntelligence.companyName,
      industry: prospectIntelligence.industry,
      businessType: prospectIntelligence.businessType,
      outreachAngle: prospectIntelligence.suggestedOutreachAngle,
      reasoningSummary: prospectIntelligence.reasoningSummary,
    })
    .from(prospectOutreachQueueItems)
    .leftJoin(contacts, eq(contacts.id, prospectOutreachQueueItems.contactId))
    .leftJoin(
      prospectIntelligence,
      eq(prospectIntelligence.contactId, prospectOutreachQueueItems.contactId),
    )
    .where(and(...conditions));

  const workspace = await loadProspectAiWorkspaceContext(params.workspaceUserId, {
    analysisPath: "outreach_draft_rewrite",
  });
  const workspaceContextBlock = formatOutreachSenderContextForPrompt({
    displayName: workspace.displayName,
    businessName: workspace.businessName,
    email: workspace.email,
    website: workspace.website,
    phone: workspace.phone,
    executiveSummary: workspace.executiveSummary,
    servicesProducts: workspace.servicesProducts,
    configured: workspace.configured,
  });

  let rewritten = 0;
  let skipped = 0;
  let failed = 0;

  await mapPool(rows, REWRITE_CONCURRENCY, async (row) => {
    const subject = String(row.item.subjectSnapshot || "").trim();
    const message = String(row.item.messageSnapshot || "").trim();
    if (!subject || !message) {
      skipped += 1;
      return;
    }
    try {
      const prospectIntelligenceBlock = formatOutreachProspectIntelligenceForPrompt({
        prospectName: row.name,
        companyName: row.companyName,
        industry: row.industry,
        businessType: row.businessType,
        outreachAngle: row.outreachAngle,
        reasoningSummary: row.reasoningSummary,
        recipientIdentity: row.item.recipientIdentity,
      });
      const raw = await aiProvider.complete(
        "extraction",
        [
          { role: "system", content: buildOutreachDraftRewriteSystemPrompt() },
          {
            role: "user",
            content: buildOutreachDraftRewriteUserPrompt({
              prospectName: row.name,
              subject,
              message,
              instructions: params.instructions,
              workspaceContextBlock,
              prospectIntelligenceBlock,
            }),
          },
        ],
        { jsonMode: true, maxTokens: 700 },
      );
      const content = typeof raw === "string" ? raw : raw.content;
      const parsed = parseOutreachDraftRewriteResponse(content);
      if (!parsed) {
        failed += 1;
        return;
      }
      await db
        .update(prospectOutreachQueueItems)
        .set({
          subjectSnapshot: parsed.subject,
          messageSnapshot: parsed.message,
          updatedAt: new Date(),
        })
        .where(eq(prospectOutreachQueueItems.id, row.item.id));

      // Keep Review-side snapshots aligned when present.
      await db
        .update(prospectIntelligence)
        .set({
          suggestedOutreachSubject: parsed.subject,
          suggestedFirstMessage: parsed.message,
          updatedAt: new Date(),
        })
        .where(eq(prospectIntelligence.contactId, row.item.contactId));

      rewritten += 1;
    } catch {
      failed += 1;
    }
  });

  return { rewritten, skipped, failed };
}
