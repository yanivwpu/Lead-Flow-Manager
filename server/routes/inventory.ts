import type { Express } from "express";
import { z } from "zod";
import { DEV_SEED_PRODUCTION_BLOCK_MESSAGE } from "@shared/inventory/inventoryDevSeedGuard";
import { inventoryListingStatusSchema } from "@shared/inventory/inventoryListingSchema";
import { canUseInventoryConnector, isInventoryConnectorEnabled } from "../inventory/inventoryGate";
import { isRgeInstalledForUser } from "../buyerPreferenceService";
import { getInventoryListing, listInventoryListings } from "../inventory/inventoryDb";
import {
  createInventorySourceBodySchema,
  createSourceForUser,
  InventorySourceError,
  listSourcesForUser,
  patchInventorySourceBodySchema,
  removeSourceForUser,
  toPublicInventorySource,
  updateSourceForUser,
  validateSourceConnection,
} from "../inventory/inventorySourceService";
import { startInventorySourceSync } from "../inventory/inventorySyncService";
import { getInventorySource } from "../inventory/inventoryDb";

async function requireInventoryAccess(
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; body: Record<string, unknown> }> {
  const gate = await canUseInventoryConnector(userId);
  if (!gate.ok) {
    return {
      ok: false,
      status: gate.reason === "feature_disabled" ? 404 : 403,
      body: { error: "Inventory connector unavailable", reason: gate.reason },
    };
  }
  return { ok: true };
}

const listingsQuerySchema = z.object({
  sourceId: z.string().uuid().optional(),
  status: inventoryListingStatusSchema.optional(),
  city: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export function registerInventoryRoutes(app: Express): void {
  app.get("/api/inventory/status", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const featureEnabled = isInventoryConnectorEnabled();
      const rgeInstalled = await isRgeInstalledForUser(req.user.id);
      const canUse = featureEnabled && rgeInstalled;
      res.json({
        featureEnabled,
        rgeInstalled,
        canUse,
        reason: !featureEnabled
          ? "feature_disabled"
          : !rgeInstalled
            ? "rge_not_installed"
            : "ok",
      });
    } catch (error) {
      console.error("[inventory] status", error);
      res.status(500).json({ error: "Failed to read inventory status" });
    }
  });

  app.get("/api/inventory/sources", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const sources = await listSourcesForUser(req.user.id);
      res.json({ sources });
    } catch (error) {
      console.error("[inventory] list sources", error);
      res.status(500).json({ error: "Failed to list inventory sources" });
    }
  });

  app.post("/api/inventory/sources", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const body = createInventorySourceBodySchema.parse(req.body);
      const source = await createSourceForUser(req.user.id, body);
      res.status(201).json({ source });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.flatten() });
      }
      if (error instanceof InventorySourceError) {
        const status = error.code === "provider_exists" ? 409 : 400;
        return res.status(status).json({ error: error.message, code: error.code });
      }
      console.error("[inventory] create source", error);
      res.status(500).json({ error: "Failed to create inventory source" });
    }
  });

  app.get("/api/inventory/sources/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const source = await getInventorySource(req.user.id, req.params.id);
      if (!source) return res.status(404).json({ error: "Inventory source not found" });
      res.json({ source: toPublicInventorySource(source) });
    } catch (error) {
      console.error("[inventory] get source", error);
      res.status(500).json({ error: "Failed to fetch inventory source" });
    }
  });

  app.patch("/api/inventory/sources/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const body = patchInventorySourceBodySchema.parse(req.body);
      const source = await updateSourceForUser(req.user.id, req.params.id, body);
      if (!source) return res.status(404).json({ error: "Inventory source not found" });
      res.json({ source });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request", details: error.flatten() });
      }
      if (error instanceof InventorySourceError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      console.error("[inventory] patch source", error);
      res.status(500).json({ error: "Failed to update inventory source" });
    }
  });

  app.delete("/api/inventory/sources/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const removed = await removeSourceForUser(req.user.id, req.params.id);
      if (!removed) return res.status(404).json({ error: "Inventory source not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("[inventory] delete source", error);
      res.status(500).json({ error: "Failed to delete inventory source" });
    }
  });

  app.post("/api/inventory/sources/:id/validate", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const result = await validateSourceConnection(req.user.id, req.params.id);
      if (!result) return res.status(404).json({ error: "Inventory source not found" });

      res.json(result);
    } catch (error) {
      console.error("[inventory] validate source", error);
      res.status(500).json({ error: "Failed to validate inventory source" });
    }
  });

  app.post("/api/inventory/sources/:id/sync", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const validation = await validateSourceConnection(req.user.id, req.params.id);
      if (!validation) {
        return res.status(404).json({ error: "Inventory source not found" });
      }
      if (!validation.ok) {
        return res.status(400).json({
          error: validation.message ?? "Connection validation failed",
          code: "validation_failed",
        });
      }

      const outcome = await startInventorySourceSync(req.user.id, req.params.id);
      if (outcome.reason === "source_not_found") {
        return res.status(404).json({ error: "Inventory source not found" });
      }
      if (outcome.reason === "not_supported") {
        return res.status(400).json({
          error:
            "This inventory source does not support listing sync. Connect a listing feed provider as your inventory source.",
          code: "listing_sync_not_supported",
        });
      }
      if (outcome.reason === "dev_seed_blocked") {
        return res.status(403).json({
          error: DEV_SEED_PRODUCTION_BLOCK_MESSAGE,
          code: "dev_seed_not_allowed",
        });
      }
      if (!outcome.started) {
        return res.status(409).json({ error: "Sync already running", code: "sync_in_progress" });
      }
      res.status(202).json({ syncStarted: true, validated: true });
    } catch (error) {
      console.error("[inventory] sync source", error);
      res.status(500).json({ error: "Failed to start inventory sync" });
    }
  });

  app.get("/api/inventory/listings", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const query = listingsQuerySchema.parse(req.query);
      const { rows, total } = await listInventoryListings({
        userId: req.user.id,
        sourceId: query.sourceId,
        status: query.status,
        city: query.city,
        page: query.page,
        limit: query.limit,
      });

      res.json({
        listings: rows,
        pagination: {
          page: query.page,
          limit: query.limit,
          total,
          totalPages: Math.ceil(total / query.limit) || 0,
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query", details: error.flatten() });
      }
      console.error("[inventory] list listings", error);
      res.status(500).json({ error: "Failed to list inventory listings" });
    }
  });

  app.get("/api/inventory/listings/:id", async (req, res) => {
    try {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });
      const gate = await requireInventoryAccess(req.user.id);
      if (!gate.ok) return res.status(gate.status).json(gate.body);

      const listing = await getInventoryListing(req.user.id, req.params.id);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      res.json({ listing });
    } catch (error) {
      console.error("[inventory] get listing", error);
      res.status(500).json({ error: "Failed to fetch listing" });
    }
  });
}
