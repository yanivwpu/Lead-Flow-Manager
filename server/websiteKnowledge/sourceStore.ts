/**
 * Workspace-scoped persistence for V2 Website Knowledge sources.
 * Every query filters on userId — there is no cross-workspace read path.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../drizzle/db";
import {
  aiWebsiteKnowledgeSources,
  type AiWebsiteKnowledgeSourceRow,
} from "@shared/schema";
import { normalizeWebsiteKnowledgeUrl } from "@shared/websiteKnowledgeSources";

export type SourceDetectedType =
  | "pricing"
  | "services"
  | "about"
  | "faq"
  | "policy"
  | "contact"
  | "locations"
  | "other";

export type SourceStatus = "pending" | "scanning" | "scanned" | "failed" | "stale" | "disabled";

export const SOURCE_DETECTED_TYPES: readonly SourceDetectedType[] = [
  "pricing",
  "services",
  "about",
  "faq",
  "policy",
  "contact",
  "locations",
  "other",
];

/** Legacy fixed slots map onto detected types so migrated sources are not all "other". */
const SLOT_KEY_TO_DETECTED_TYPE: Record<string, SourceDetectedType> = {
  homepage: "about",
  productServices: "services",
  about: "about",
  faq: "faq",
  shippingPolicy: "policy",
  returnPolicy: "policy",
  terms: "policy",
  privacy: "policy",
  other: "other",
};

export function detectedTypeForSlotKey(slotKey: string | null | undefined): SourceDetectedType {
  if (!slotKey) return "other";
  return SLOT_KEY_TO_DETECTED_TYPE[slotKey] ?? "other";
}

export async function listKnowledgeSources(
  userId: string,
  opts?: { enabledOnly?: boolean },
): Promise<AiWebsiteKnowledgeSourceRow[]> {
  const where = opts?.enabledOnly
    ? and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.isEnabled, true))
    : eq(aiWebsiteKnowledgeSources.userId, userId);
  return db
    .select()
    .from(aiWebsiteKnowledgeSources)
    .where(where)
    .orderBy(asc(aiWebsiteKnowledgeSources.firstAddedAt));
}

export async function getKnowledgeSource(
  userId: string,
  sourceId: string,
): Promise<AiWebsiteKnowledgeSourceRow | undefined> {
  const rows = await db
    .select()
    .from(aiWebsiteKnowledgeSources)
    .where(and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.id, sourceId)));
  return rows[0];
}

export async function getKnowledgeSourcesByIds(
  userId: string,
  sourceIds: string[],
): Promise<AiWebsiteKnowledgeSourceRow[]> {
  if (sourceIds.length === 0) return [];
  return db
    .select()
    .from(aiWebsiteKnowledgeSources)
    .where(
      and(
        eq(aiWebsiteKnowledgeSources.userId, userId),
        inArray(aiWebsiteKnowledgeSources.id, sourceIds),
      ),
    );
}

export type UpsertSourceInput = {
  url: string;
  slotKey?: string | null;
  title?: string | null;
  customLabel?: string | null;
  detectedType?: SourceDetectedType;
  /** Existing rows keep their scan history unless the caller explicitly resets it. */
  resetStatus?: boolean;
};

/**
 * Idempotent on (userId, normalizedUrl): adding the same page twice updates the label
 * instead of creating a duplicate source that would double-count its facts.
 */
export async function upsertKnowledgeSource(
  userId: string,
  input: UpsertSourceInput,
): Promise<AiWebsiteKnowledgeSourceRow> {
  const url = input.url.trim();
  const normalizedUrl = normalizeWebsiteKnowledgeUrl(url);
  const now = new Date();

  const existing = await db
    .select()
    .from(aiWebsiteKnowledgeSources)
    .where(
      and(
        eq(aiWebsiteKnowledgeSources.userId, userId),
        eq(aiWebsiteKnowledgeSources.normalizedUrl, normalizedUrl),
      ),
    );

  if (existing[0]) {
    const patch: Partial<AiWebsiteKnowledgeSourceRow> = { updatedAt: now };
    if (input.slotKey !== undefined && !existing[0].slotKey) patch.slotKey = input.slotKey;
    if (input.customLabel !== undefined) patch.customLabel = input.customLabel;
    if (input.title !== undefined && input.title) patch.title = input.title;
    if (input.detectedType && existing[0].detectedType === "other") {
      patch.detectedType = input.detectedType;
    }
    if (input.resetStatus) {
      patch.status = "pending";
      patch.errorCode = null;
      patch.errorMessage = null;
    }
    if (!existing[0].isEnabled) patch.isEnabled = true;
    const updated = await db
      .update(aiWebsiteKnowledgeSources)
      .set(patch)
      .where(eq(aiWebsiteKnowledgeSources.id, existing[0].id))
      .returning();
    return updated[0];
  }

  const inserted = await db
    .insert(aiWebsiteKnowledgeSources)
    .values({
      userId,
      url,
      normalizedUrl,
      slotKey: input.slotKey ?? null,
      title: input.title ?? null,
      customLabel: input.customLabel ?? null,
      detectedType: input.detectedType ?? detectedTypeForSlotKey(input.slotKey),
      status: "pending",
      firstAddedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return inserted[0];
}

export type SourceScanOutcome = {
  status: SourceStatus;
  detectedType?: SourceDetectedType;
  title?: string | null;
  contentHash?: string | null;
  charCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordSourceScanOutcome(
  userId: string,
  sourceId: string,
  outcome: SourceScanOutcome,
  now = new Date(),
): Promise<void> {
  const patch: Record<string, unknown> = {
    status: outcome.status,
    lastScannedAt: now,
    updatedAt: now,
    errorCode: outcome.errorCode ?? null,
    errorMessage: outcome.errorMessage ?? null,
  };
  if (outcome.status === "scanned") patch.lastSuccessfulScanAt = now;
  if (outcome.detectedType) patch.detectedType = outcome.detectedType;
  if (outcome.title !== undefined) patch.title = outcome.title;
  if (outcome.contentHash !== undefined) patch.contentHash = outcome.contentHash;
  if (outcome.charCount !== undefined) patch.charCount = outcome.charCount;
  if (outcome.metadata) patch.metadata = outcome.metadata;

  await db
    .update(aiWebsiteKnowledgeSources)
    .set(patch)
    .where(
      and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.id, sourceId)),
    );
}

export async function markSourceScanning(userId: string, sourceId: string): Promise<void> {
  await db
    .update(aiWebsiteKnowledgeSources)
    .set({ status: "scanning", updatedAt: new Date() })
    .where(
      and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.id, sourceId)),
    );
}

export async function bumpSourceScanVersion(
  userId: string,
  sourceId: string,
  scanVersion: number,
): Promise<void> {
  await db
    .update(aiWebsiteKnowledgeSources)
    .set({ scanVersion, updatedAt: new Date() })
    .where(
      and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.id, sourceId)),
    );
}

export async function deleteKnowledgeSource(userId: string, sourceId: string): Promise<boolean> {
  const deleted = await db
    .delete(aiWebsiteKnowledgeSources)
    .where(
      and(eq(aiWebsiteKnowledgeSources.userId, userId), eq(aiWebsiteKnowledgeSources.id, sourceId)),
    )
    .returning();
  return deleted.length > 0;
}

export function sourceDisplayLabel(row: AiWebsiteKnowledgeSourceRow): string {
  return row.customLabel?.trim() || row.title?.trim() || row.url;
}
