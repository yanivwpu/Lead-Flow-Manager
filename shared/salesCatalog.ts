import { z } from "zod";
import { OFFER_AVAILABILITY, type WorkspaceOffer } from "./workspaceOffers";

/** Phase 1A uses existing offers verbatim. Commerce fields belong to future adapters. */
export type SalesCatalogItem = WorkspaceOffer;
export const SALES_CATALOG_PAGE_MAX = 100;
export const salesCatalogSearchSchema = z.object({
  query: z.string().trim().max(200).default(""),
  category: z.string().trim().max(80).optional(),
  tag: z.string().trim().max(40).optional(),
  availability: z.enum(OFFER_AVAILABILITY).optional(),
  status: z
    .enum(["all", "active", "inactive", "archived", "purchasable"])
    .default("all"),
  limit: z.coerce.number().int().min(1).max(SALES_CATALOG_PAGE_MAX).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
export type SalesCatalogSearch = z.input<typeof salesCatalogSearchSchema>;
export type SalesCatalogPage = {
  items: SalesCatalogItem[];
  nextOffset: number | null;
};
export type CatalogReadiness = {
  connection: "connected" | "disconnected" | "error";
  catalog: "ready" | "not_implemented" | "permission_required" | "syncing" | "stale" | "error";
};
/** Legacy connection-only helper. Actual provider readiness uses catalogReadiness in the server service. */
export function shopifyCatalogReadiness(connected: boolean): CatalogReadiness {
  return {
    connection: connected ? "connected" : "disconnected",
    catalog: "not_implemented",
  };
}
export function isPurchasableCatalogItem(item: SalesCatalogItem): boolean {
  return (
    item.active &&
    !item.archivedAt &&
    (item.availability === "available" || item.availability === "limited")
  );
}
