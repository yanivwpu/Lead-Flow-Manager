/**
 * Persistence for workspace-owned Marketing Materials.
 * All queries are scoped by userId (workspace owner). Soft-delete never removes R2 bytes.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../drizzle/db";
import {
  workspaceMarketingAssets,
  type WorkspaceMarketingAssetRow,
} from "@shared/schema";
import {
  parseMarketingAssetWrite,
  sanitizeMarketingFilename,
  toMarketingAssetCatalogItem,
  type MarketingAssetCatalogItem,
  type MarketingAssetPublicView,
} from "@shared/marketingAssets";

export function toMarketingAssetView(row: WorkspaceMarketingAssetRow): MarketingAssetPublicView {
  const catalog = toMarketingAssetCatalogItem({
    id: row.id,
    displayName: row.displayName,
    description: row.description,
    language: row.language,
    topics: row.topics,
    kind: row.kind,
  });
  return {
    id: row.id,
    displayName: catalog?.displayName || row.displayName,
    description: catalog?.description ?? null,
    language: catalog?.language || "all",
    topics: catalog?.topics || [],
    kind: row.kind === "document" ? "document" : "image",
    enabled: Boolean(row.enabled) && !row.deletedAt,
    mimeType: row.mimeType,
    originalFilename: row.originalFilename,
    size: row.mediaSize || 0,
    createdAt: row.createdAt ? row.createdAt.toISOString() : new Date(0).toISOString(),
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date(0).toISOString(),
  };
}

export async function listMarketingAssets(
  userId: string,
  opts?: { includeDeleted?: boolean },
): Promise<MarketingAssetPublicView[]> {
  const conditions = [eq(workspaceMarketingAssets.userId, userId)];
  if (!opts?.includeDeleted) {
    conditions.push(isNull(workspaceMarketingAssets.deletedAt));
  }
  const rows = await db
    .select()
    .from(workspaceMarketingAssets)
    .where(and(...conditions))
    .orderBy(desc(workspaceMarketingAssets.createdAt));
  return rows.map(toMarketingAssetView);
}

export async function listEnabledMarketingAssetCatalog(
  userId: string,
  locale?: unknown,
): Promise<MarketingAssetCatalogItem[]> {
  const rows = await db
    .select()
    .from(workspaceMarketingAssets)
    .where(
      and(
        eq(workspaceMarketingAssets.userId, userId),
        eq(workspaceMarketingAssets.enabled, true),
        isNull(workspaceMarketingAssets.deletedAt),
      ),
    )
    .orderBy(desc(workspaceMarketingAssets.createdAt));
  const { marketingAssetMatchesLocale } = await import("@shared/marketingAssets");
  const out: MarketingAssetCatalogItem[] = [];
  for (const row of rows) {
    if (locale != null && !marketingAssetMatchesLocale(row.language, locale)) continue;
    const item = toMarketingAssetCatalogItem({
      id: row.id,
      displayName: row.displayName,
      description: row.description,
      language: row.language,
      topics: row.topics,
      kind: row.kind,
    });
    if (item) out.push(item);
  }
  return out;
}

export async function getMarketingAsset(
  userId: string,
  assetId: string,
): Promise<WorkspaceMarketingAssetRow | undefined> {
  const [row] = await db
    .select()
    .from(workspaceMarketingAssets)
    .where(
      and(
        eq(workspaceMarketingAssets.userId, userId),
        eq(workspaceMarketingAssets.id, assetId),
      ),
    )
    .limit(1);
  return row;
}

export async function createMarketingAsset(params: {
  userId: string;
  displayName: string;
  description: string | null;
  language: string;
  topics: string[];
  enabled: boolean;
  kind: "image" | "document";
  mimeType: string;
  originalFilename: string;
  mediaUrl: string;
  mediaStorageKey: string;
  mediaSize: number;
}): Promise<WorkspaceMarketingAssetRow> {
  const [row] = await db
    .insert(workspaceMarketingAssets)
    .values({
      userId: params.userId,
      displayName: params.displayName,
      description: params.description,
      language: params.language,
      topics: params.topics,
      enabled: params.enabled,
      kind: params.kind,
      mimeType: params.mimeType,
      originalFilename: sanitizeMarketingFilename(params.originalFilename, params.mimeType),
      mediaUrl: params.mediaUrl,
      mediaStorageKey: params.mediaStorageKey,
      mediaSize: params.mediaSize,
    })
    .returning();
  return row;
}

export async function updateMarketingAsset(
  userId: string,
  assetId: string,
  raw: unknown,
): Promise<{ ok: true; row: WorkspaceMarketingAssetRow } | { ok: false; status: number; error: string }> {
  const existing = await getMarketingAsset(userId, assetId);
  if (!existing || existing.deletedAt) {
    return { ok: false, status: 404, error: "Material not found" };
  }
  const parsed = parseMarketingAssetWrite({
    displayName: existing.displayName,
    description: existing.description,
    language: existing.language,
    topics: existing.topics,
    enabled: existing.enabled,
    ...(raw && typeof raw === "object" ? raw : {}),
  });
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const [row] = await db
    .update(workspaceMarketingAssets)
    .set({
      displayName: parsed.data.displayName,
      description: parsed.data.description,
      language: parsed.data.language,
      topics: parsed.data.topics,
      enabled: parsed.data.enabled,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceMarketingAssets.userId, userId),
        eq(workspaceMarketingAssets.id, assetId),
        isNull(workspaceMarketingAssets.deletedAt),
      ),
    )
    .returning();
  if (!row) return { ok: false, status: 404, error: "Material not found" };
  return { ok: true, row };
}

export async function softDeleteMarketingAsset(
  userId: string,
  assetId: string,
): Promise<{ ok: true; row: WorkspaceMarketingAssetRow } | { ok: false; status: number; error: string }> {
  const existing = await getMarketingAsset(userId, assetId);
  if (!existing || existing.deletedAt) {
    return { ok: false, status: 404, error: "Material not found" };
  }
  const [row] = await db
    .update(workspaceMarketingAssets)
    .set({
      enabled: false,
      deletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(workspaceMarketingAssets.userId, userId),
        eq(workspaceMarketingAssets.id, assetId),
        isNull(workspaceMarketingAssets.deletedAt),
      ),
    )
    .returning();
  if (!row) return { ok: false, status: 404, error: "Material not found" };
  return { ok: true, row };
}

export async function getSendableMarketingAsset(params: {
  userId: string;
  assetId: string;
  locale?: unknown;
}): Promise<
  | { ok: true; row: WorkspaceMarketingAssetRow }
  | { ok: false; reason: "not_found" | "disabled" | "locale" }
> {
  const row = await getMarketingAsset(params.userId, params.assetId);
  if (!row || row.userId !== params.userId) return { ok: false, reason: "not_found" };
  if (row.deletedAt || !row.enabled) return { ok: false, reason: "disabled" };
  const { marketingAssetMatchesLocale } = await import("@shared/marketingAssets");
  if (!marketingAssetMatchesLocale(row.language, params.locale)) {
    return { ok: false, reason: "locale" };
  }
  return { ok: true, row };
}
