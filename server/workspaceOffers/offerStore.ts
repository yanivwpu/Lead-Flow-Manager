/**
 * Persistence for workspace-owned Offers & Payment Links.
 * All queries are scoped by userId (workspace owner).
 */

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../drizzle/db";
import { workspaceOffers, type WorkspaceOfferRow } from "@shared/schema";
import {
  validateCheckoutUrl,
  workspaceOfferWriteSchema,
  type WorkspaceOffer,
  type WorkspaceOfferWrite,
} from "@shared/workspaceOffers";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter((s) => s.trim().length > 0);
}

export function toWorkspaceOfferView(row: WorkspaceOfferRow): WorkspaceOffer {
  return {
    id: row.id,
    userId: row.userId,
    internalName: row.internalName,
    displayName: row.displayName,
    description: row.description ?? null,
    benefits: asStringArray(row.benefits),
    priceDisplay: row.priceDisplay ?? null,
    billingCadence: (row.billingCadence || "once") as WorkspaceOffer["billingCadence"],
    checkoutUrl: row.checkoutUrl ?? null,
    followUpUrl: row.followUpUrl ?? null,
    availability: (row.availability || "available") as WorkspaceOffer["availability"],
    active: Boolean(row.active),
    sortOrder: row.sortOrder ?? 0,
    category: row.category ?? null,
    tags: asStringArray(row.tags),
    aiGuidance: row.aiGuidance ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date(0).toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date(0).toISOString(),
  };
}

function normalizeWriteInput(raw: unknown): {
  ok: true;
  data: WorkspaceOfferWrite;
} | { ok: false; error: string } {
  const parsed = workspaceOfferWriteSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid offer" };
  }
  const checkout = validateCheckoutUrl(parsed.data.checkoutUrl);
  if (!checkout.ok) return { ok: false, error: checkout.error || "Invalid checkout URL" };
  const followUp = validateCheckoutUrl(parsed.data.followUpUrl);
  if (!followUp.ok) return { ok: false, error: followUp.error || "Invalid follow-up URL" };
  return {
    ok: true,
    data: {
      ...parsed.data,
      checkoutUrl: checkout.url,
      followUpUrl: followUp.url,
    },
  };
}

export async function listWorkspaceOffers(
  userId: string,
  opts?: { includeArchived?: boolean; activeOnly?: boolean },
): Promise<WorkspaceOffer[]> {
  const conditions = [eq(workspaceOffers.userId, userId)];
  if (!opts?.includeArchived) {
    conditions.push(isNull(workspaceOffers.archivedAt));
  }
  if (opts?.activeOnly) {
    conditions.push(eq(workspaceOffers.active, true));
  }
  const rows = await db
    .select()
    .from(workspaceOffers)
    .where(and(...conditions))
    .orderBy(asc(workspaceOffers.sortOrder), asc(workspaceOffers.createdAt));
  return rows.map(toWorkspaceOfferView);
}

export async function countActiveWorkspaceOffers(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceOffers)
    .where(
      and(
        eq(workspaceOffers.userId, userId),
        eq(workspaceOffers.active, true),
        isNull(workspaceOffers.archivedAt),
      ),
    );
  return row?.count ?? 0;
}

export async function getWorkspaceOffer(
  userId: string,
  offerId: string,
): Promise<WorkspaceOffer | null> {
  const [row] = await db
    .select()
    .from(workspaceOffers)
    .where(and(eq(workspaceOffers.id, offerId), eq(workspaceOffers.userId, userId)))
    .limit(1);
  return row ? toWorkspaceOfferView(row) : null;
}

export async function createWorkspaceOffer(
  userId: string,
  raw: unknown,
): Promise<{ ok: true; offer: WorkspaceOffer } | { ok: false; error: string }> {
  const normalized = normalizeWriteInput(raw);
  if (!normalized.ok) return normalized;

  const existing = await listWorkspaceOffers(userId, { includeArchived: false });
  const nextSort =
    typeof normalized.data.sortOrder === "number" && normalized.data.sortOrder > 0
      ? normalized.data.sortOrder
      : existing.length === 0
        ? 0
        : Math.max(...existing.map((o) => o.sortOrder)) + 1;

  const [row] = await db
    .insert(workspaceOffers)
    .values({
      userId,
      internalName: normalized.data.internalName,
      displayName: normalized.data.displayName,
      description: normalized.data.description,
      benefits: normalized.data.benefits,
      priceDisplay: normalized.data.priceDisplay,
      billingCadence: normalized.data.billingCadence,
      checkoutUrl: normalized.data.checkoutUrl,
      followUpUrl: normalized.data.followUpUrl,
      availability: normalized.data.availability,
      active: normalized.data.active,
      sortOrder: nextSort,
      category: normalized.data.category,
      tags: normalized.data.tags,
      aiGuidance: normalized.data.aiGuidance,
      updatedAt: new Date(),
    })
    .returning();

  return { ok: true, offer: toWorkspaceOfferView(row) };
}

export async function updateWorkspaceOffer(
  userId: string,
  offerId: string,
  raw: unknown,
): Promise<{ ok: true; offer: WorkspaceOffer } | { ok: false; error: string; status?: number }> {
  const existing = await getWorkspaceOffer(userId, offerId);
  if (!existing || existing.archivedAt) {
    return { ok: false, error: "Offer not found", status: 404 };
  }

  const normalized = normalizeWriteInput({
    ...existing,
    ...(typeof raw === "object" && raw ? raw : {}),
  });
  if (!normalized.ok) return normalized;

  const [row] = await db
    .update(workspaceOffers)
    .set({
      internalName: normalized.data.internalName,
      displayName: normalized.data.displayName,
      description: normalized.data.description,
      benefits: normalized.data.benefits,
      priceDisplay: normalized.data.priceDisplay,
      billingCadence: normalized.data.billingCadence,
      checkoutUrl: normalized.data.checkoutUrl,
      followUpUrl: normalized.data.followUpUrl,
      availability: normalized.data.availability,
      active: normalized.data.active,
      sortOrder: normalized.data.sortOrder,
      category: normalized.data.category,
      tags: normalized.data.tags,
      aiGuidance: normalized.data.aiGuidance,
      updatedAt: new Date(),
    })
    .where(and(eq(workspaceOffers.id, offerId), eq(workspaceOffers.userId, userId)))
    .returning();

  if (!row) return { ok: false, error: "Offer not found", status: 404 };
  return { ok: true, offer: toWorkspaceOfferView(row) };
}

export async function reorderWorkspaceOffers(
  userId: string,
  orderedIds: string[],
): Promise<{ ok: true; offers: WorkspaceOffer[] } | { ok: false; error: string }> {
  const ids = [...new Set(orderedIds.map(String).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "No offer ids provided" };

  const existing = await listWorkspaceOffers(userId, { includeArchived: false });
  const existingIds = new Set(existing.map((o) => o.id));
  for (const id of ids) {
    if (!existingIds.has(id)) {
      return { ok: false, error: "One or more offers were not found in this workspace" };
    }
  }

  const now = new Date();
  for (let i = 0; i < ids.length; i++) {
    await db
      .update(workspaceOffers)
      .set({ sortOrder: i, updatedAt: now })
      .where(and(eq(workspaceOffers.id, ids[i]), eq(workspaceOffers.userId, userId)));
  }

  return { ok: true, offers: await listWorkspaceOffers(userId, { includeArchived: false }) };
}

/** Soft-delete: archive + deactivate. Safe for AI (excluded from active queries). */
export async function archiveWorkspaceOffer(
  userId: string,
  offerId: string,
): Promise<{ ok: true; offer: WorkspaceOffer } | { ok: false; error: string; status?: number }> {
  const [row] = await db
    .update(workspaceOffers)
    .set({
      active: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceOffers.id, offerId),
        eq(workspaceOffers.userId, userId),
        isNull(workspaceOffers.archivedAt),
      ),
    )
    .returning();

  if (!row) return { ok: false, error: "Offer not found", status: 404 };
  return { ok: true, offer: toWorkspaceOfferView(row) };
}
