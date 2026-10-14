import type { WorkspaceOfferRow } from "@shared/schema";
import type { WorkspaceOffer } from "@shared/workspaceOffers";

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
    billingCadence: (row.billingCadence ||
      "once") as WorkspaceOffer["billingCadence"],
    checkoutUrl: row.checkoutUrl ?? null,
    followUpUrl: row.followUpUrl ?? null,
    availability: (row.availability ||
      "available") as WorkspaceOffer["availability"],
    active: Boolean(row.active),
    sortOrder: row.sortOrder ?? 0,
    category: row.category ?? null,
    tags: asStringArray(row.tags),
    aiGuidance: row.aiGuidance ?? null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt
      ? row.createdAt.toISOString()
      : new Date(0).toISOString(),
    updatedAt: row.updatedAt
      ? row.updatedAt.toISOString()
      : new Date(0).toISOString(),
  };
}
