/**
 * Workspace-scoped persistence for structured business facts.
 *
 * Row -> KnowledgeFact mapping validates the payload, so a malformed row (hand-edited SQL,
 * an older shape) is skipped rather than reaching a prompt as a half-formed fact.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { businessKnowledgeFacts, type BusinessKnowledgeFactRow } from "@shared/schema";
import {
  isFactType,
  parseFactData,
  truncateExcerpt,
  type FactOrigin,
  type FactProposedAction,
  type FactProvenanceEntry,
  type FactState,
  type FactType,
  type KnowledgeFact,
} from "@shared/businessKnowledgeFacts";
import type { FactMergeOperation } from "./mergeFacts";

type DbLike = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

const FACT_ORIGINS: readonly FactOrigin[] = [
  "user_edited",
  "user_entered",
  "website_verified",
  "document",
  "integration",
  "ai_extracted",
  "migrated_source",
  "legacy_summary",
];

function iso(value: Date | string | null | undefined, fallback: string): string {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  return fallback;
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseProvenance(raw: unknown): FactProvenanceEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: FactProvenanceEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    out.push({
      sourceId: typeof o.sourceId === "string" ? o.sourceId : null,
      url: typeof o.url === "string" ? o.url : null,
      title: typeof o.title === "string" ? o.title : null,
      verifiedAt: typeof o.verifiedAt === "string" ? o.verifiedAt : null,
    });
  }
  return out;
}

/** Returns null when the row cannot be trusted as a valid fact. */
export function rowToKnowledgeFact(row: BusinessKnowledgeFactRow): KnowledgeFact | null {
  if (!isFactType(row.factType)) return null;
  const parsed = parseFactData(row.factType, row.data);
  if (!parsed.ok) return null;

  const epoch = new Date(0).toISOString();
  const state: FactState =
    row.state === "published" || row.state === "retired" ? row.state : "draft";
  const origin = FACT_ORIGINS.includes(row.origin as FactOrigin)
    ? (row.origin as FactOrigin)
    : "ai_extracted";
  const proposedAction =
    row.proposedAction === "add" ||
    row.proposedAction === "update" ||
    row.proposedAction === "retire" ||
    row.proposedAction === "suggest"
      ? (row.proposedAction as FactProposedAction)
      : null;

  return {
    id: row.id,
    userId: row.userId,
    sourceId: row.sourceId ?? null,
    factType: parsed.factType,
    factKey: row.factKey,
    data: parsed.data,
    state,
    proposedAction,
    origin,
    confidence: typeof row.confidence === "number" ? row.confidence : 0.5,
    isPinned: row.isPinned === true,
    userEdited: row.userEdited === true,
    conflictGroup: row.conflictGroup ?? null,
    conflictResolution:
      row.conflictResolution === "precedence" || row.conflictResolution === "user"
        ? row.conflictResolution
        : null,
    supersededByFactId: row.supersededByFactId ?? null,
    sourceUrl: row.sourceUrl ?? null,
    sourceTitle: row.sourceTitle ?? null,
    excerpt: row.excerpt ?? null,
    provenance: parseProvenance(row.provenance),
    firstSeenAt: iso(row.firstSeenAt, epoch),
    lastVerifiedAt: iso(row.lastVerifiedAt, epoch),
    publishedAt: isoOrNull(row.publishedAt),
    retiredAt: isoOrNull(row.retiredAt),
  } as KnowledgeFact;
}

export type ListFactsOptions = {
  states?: FactState[];
  factTypes?: FactType[];
};

export async function listFacts(
  userId: string,
  opts?: ListFactsOptions,
): Promise<KnowledgeFact[]> {
  const conditions = [eq(businessKnowledgeFacts.userId, userId)];
  if (opts?.states?.length) {
    conditions.push(inArray(businessKnowledgeFacts.state, opts.states));
  }
  if (opts?.factTypes?.length) {
    conditions.push(inArray(businessKnowledgeFacts.factType, opts.factTypes));
  }
  const rows = await db
    .select()
    .from(businessKnowledgeFacts)
    .where(and(...conditions));
  return rows.map(rowToKnowledgeFact).filter((f): f is KnowledgeFact => f !== null);
}

/** Live facts = draft + published. Retired history is excluded. */
export function listLiveFacts(userId: string): Promise<KnowledgeFact[]> {
  return listFacts(userId, { states: ["draft", "published"] });
}

export function listPublishedFacts(userId: string): Promise<KnowledgeFact[]> {
  return listFacts(userId, { states: ["published"] });
}

export async function countPublishedFacts(
  userId: string,
): Promise<{ count: number; latestPublishedAt: string | null }> {
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      latest: sql<string | null>`max(${businessKnowledgeFacts.publishedAt})`,
    })
    .from(businessKnowledgeFacts)
    .where(
      and(eq(businessKnowledgeFacts.userId, userId), eq(businessKnowledgeFacts.state, "published")),
    );
  const row = rows[0];
  return {
    count: Number(row?.count ?? 0),
    latestPublishedAt: row?.latest ? new Date(row.latest).toISOString() : null,
  };
}

export async function deleteFact(userId: string, factId: string): Promise<boolean> {
  const deleted = await db
    .delete(businessKnowledgeFacts)
    .where(and(eq(businessKnowledgeFacts.userId, userId), eq(businessKnowledgeFacts.id, factId)))
    .returning();
  return deleted.length > 0;
}

export async function discardDraftFacts(userId: string): Promise<number> {
  const deleted = await db
    .delete(businessKnowledgeFacts)
    .where(and(eq(businessKnowledgeFacts.userId, userId), eq(businessKnowledgeFacts.state, "draft")))
    .returning();
  return deleted.length;
}

/**
 * Apply one source's merge plan. Runs in a transaction so a partially written proposal
 * can never be reviewed.
 */
export async function applyMergeOperations(
  userId: string,
  operations: FactMergeOperation[],
  now = new Date(),
): Promise<void> {
  if (operations.length === 0) return;
  await db.transaction(async (tx) => {
    for (const op of operations) {
      switch (op.kind) {
        case "upsert_draft": {
          // One draft per key (enforced by a partial unique index) — replace any predecessor.
          await tx
            .delete(businessKnowledgeFacts)
            .where(
              and(
                eq(businessKnowledgeFacts.userId, userId),
                eq(businessKnowledgeFacts.factKey, op.factKey),
                eq(businessKnowledgeFacts.state, "draft"),
              ),
            );
          await tx.insert(businessKnowledgeFacts).values({
            userId,
            sourceId: op.candidate.sourceId,
            factType: op.candidate.factType,
            factKey: op.factKey,
            data: op.candidate.data as unknown as Record<string, unknown>,
            state: "draft",
            proposedAction: op.proposedAction,
            origin: op.candidate.origin,
            confidence: op.candidate.confidence,
            sourceUrl: op.candidate.sourceUrl,
            sourceTitle: op.candidate.sourceTitle,
            excerpt: truncateExcerpt(op.candidate.excerpt),
            provenance: op.provenance as unknown as Record<string, unknown>[],
            firstSeenAt: now,
            lastVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
          });
          break;
        }
        case "touch_verified": {
          await tx
            .update(businessKnowledgeFacts)
            .set({
              lastVerifiedAt: new Date(op.verifiedAt),
              provenance: op.provenance as unknown as Record<string, unknown>[],
              updatedAt: now,
            })
            .where(
              and(
                eq(businessKnowledgeFacts.userId, userId),
                eq(businessKnowledgeFacts.id, op.factId),
              ),
            );
          break;
        }
        case "propose_retire": {
          const target = await tx
            .select()
            .from(businessKnowledgeFacts)
            .where(
              and(
                eq(businessKnowledgeFacts.userId, userId),
                eq(businessKnowledgeFacts.id, op.factId),
              ),
            );
          const row = target[0];
          if (!row) break;
          await tx
            .delete(businessKnowledgeFacts)
            .where(
              and(
                eq(businessKnowledgeFacts.userId, userId),
                eq(businessKnowledgeFacts.factKey, row.factKey),
                eq(businessKnowledgeFacts.state, "draft"),
              ),
            );
          // The retirement proposal mirrors the live value so review can show what would go.
          await tx.insert(businessKnowledgeFacts).values({
            userId,
            sourceId: row.sourceId,
            factType: row.factType,
            factKey: row.factKey,
            data: row.data as Record<string, unknown>,
            state: "draft",
            proposedAction: "retire",
            origin: row.origin,
            confidence: row.confidence,
            sourceUrl: row.sourceUrl,
            sourceTitle: row.sourceTitle,
            excerpt: row.excerpt,
            provenance: op.provenance as unknown as Record<string, unknown>[],
            firstSeenAt: row.firstSeenAt ?? now,
            lastVerifiedAt: row.lastVerifiedAt ?? now,
            createdAt: now,
            updatedAt: now,
          });
          break;
        }
        case "discard_draft": {
          await tx
            .delete(businessKnowledgeFacts)
            .where(
              and(
                eq(businessKnowledgeFacts.userId, userId),
                eq(businessKnowledgeFacts.id, op.factId),
                eq(businessKnowledgeFacts.state, "draft"),
              ),
            );
          break;
        }
      }
    }
  });
}

export type ManualFactInput = {
  factType: FactType;
  factKey: string;
  data: unknown;
  origin: FactOrigin;
  confidence?: number;
  isPinned?: boolean;
  userEdited?: boolean;
  excerpt?: string | null;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  state?: FactState;
};

/**
 * Insert a fact that did not come from a scan (manual entry, legacy backfill).
 * Idempotent on (userId, factKey, state) so a re-run cannot duplicate it.
 */
export async function insertFactIfAbsent(
  userId: string,
  input: ManualFactInput,
  now = new Date(),
  client: DbLike = db,
): Promise<boolean> {
  const state = input.state ?? "published";
  const existing = await client
    .select({ id: businessKnowledgeFacts.id })
    .from(businessKnowledgeFacts)
    .where(
      and(
        eq(businessKnowledgeFacts.userId, userId),
        eq(businessKnowledgeFacts.factKey, input.factKey),
        eq(businessKnowledgeFacts.state, state),
      ),
    );
  if (existing.length > 0) return false;

  await client.insert(businessKnowledgeFacts).values({
    userId,
    sourceId: null,
    factType: input.factType,
    factKey: input.factKey,
    data: input.data as Record<string, unknown>,
    state,
    proposedAction: state === "draft" ? "add" : null,
    origin: input.origin,
    confidence: input.confidence ?? 0.5,
    isPinned: input.isPinned ?? false,
    userEdited: input.userEdited ?? false,
    sourceUrl: input.sourceUrl ?? null,
    sourceTitle: input.sourceTitle ?? null,
    excerpt: truncateExcerpt(input.excerpt),
    provenance: [] as unknown as Record<string, unknown>[],
    firstSeenAt: now,
    lastVerifiedAt: now,
    publishedAt: state === "published" ? now : null,
    createdAt: now,
    updatedAt: now,
  });
  return true;
}
