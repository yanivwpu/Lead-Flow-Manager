import { z } from "zod";
import {
  inventoryConnectionStatusSchema,
  inventoryProviderSchema,
  providerSupportsListingSync,
  type InventoryProvider,
} from "@shared/inventory/inventoryProviderSchema";
import { mlsGridCredentialsSchema, mlsGridSourceConfigSchema } from "@shared/inventory/inventoryListingSchema";
import { inventorySources, type InventorySource } from "@shared/schema";
import {
  decryptSourceCredentials,
  deleteInventorySource,
  encryptSourceCredentials,
  getInventorySource,
  getInventorySourceByProvider,
  insertInventorySource,
  countListingsBySourceForUser,
  listInventorySources,
  patchInventorySource,
} from "./inventoryDb";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";
import type { InventoryAdapterContext } from "./providers/types";
import {
  sanitizeInventoryDisplayNameForUi,
  sanitizeOriginatingSystemForUi,
} from "@shared/inventory/inventoryProviderDisplay";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const createInventorySourceBodySchema = z.object({
  provider: inventoryProviderSchema,
  displayName: z.string().max(120).optional(),
  config: z.record(z.unknown()).default({}),
  credentials: z.record(z.unknown()).optional(),
  integrationId: z.string().uuid().optional().nullable(),
});

export const patchInventorySourceBodySchema = z.object({
  displayName: z.string().max(120).optional(),
  config: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
  integrationId: z.string().uuid().optional().nullable(),
  connectionStatus: inventoryConnectionStatusSchema.optional(),
  isActive: z.boolean().optional(),
});

export function toPublicInventorySource(source: InventorySource, listingCount = 0) {
  const creds = (source.credentialsEnc || {}) as Record<string, unknown>;
  const hasToken = typeof creds.accessToken === "string" && creds.accessToken.length > 0;
  const rawConfig = (source.config || {}) as Record<string, unknown>;
  const config = { ...rawConfig };
  if (typeof config.originatingSystemName === "string") {
    config.originatingSystemName = sanitizeOriginatingSystemForUi(
      config.originatingSystemName,
      IS_PRODUCTION,
    );
  }
  return {
    id: source.id,
    provider: source.provider,
    displayName: sanitizeInventoryDisplayNameForUi(source.displayName, IS_PRODUCTION),
    connectionStatus: source.connectionStatus,
    config,
    integrationId: source.integrationId,
    lastSyncAt: source.lastSyncAt,
    lastSyncStatus: source.lastSyncStatus,
    lastSyncError: source.lastSyncError,
    lastSyncStats: source.lastSyncStats,
    isActive: source.isActive,
    listingSyncSupported: providerSupportsListingSync(source.provider as InventoryProvider),
    hasCredentials: hasToken,
    listingCount,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

function defaultDisplayName(provider: InventoryProvider): string {
  if (provider === "mls_grid") {
    return IS_PRODUCTION ? "My MLS inventory" : "Primary inventory source";
  }
  return "Inventory source";
}

function validateProviderPayload(
  provider: InventoryProvider,
  config: Record<string, unknown>,
  credentials: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  if (provider === "mls_grid") {
    const cfg = mlsGridSourceConfigSchema.safeParse(config);
    if (!cfg.success) {
      return { ok: false, message: "Originating system name is required." };
    }
    const creds = mlsGridCredentialsSchema.safeParse(credentials);
    if (!creds.success) {
      return { ok: false, message: "Access token is required when connecting a new source." };
    }
  }
  return { ok: true };
}

export function buildAdapterContext(source: InventorySource): InventoryAdapterContext {
  return {
    userId: source.userId,
    source,
    config: (source.config || {}) as Record<string, unknown>,
    credentials: decryptSourceCredentials((source.credentialsEnc || {}) as Record<string, unknown>),
  };
}

export async function listSourcesForUser(userId: string) {
  const rows = await listInventorySources(userId);
  const counts = await countListingsBySourceForUser(userId);
  return rows.map((row) => toPublicInventorySource(row, counts[row.id] ?? 0));
}

export async function createSourceForUser(
  userId: string,
  body: z.infer<typeof createInventorySourceBodySchema>,
) {
  const existing = await getInventorySourceByProvider(userId, body.provider);
  if (existing) {
    throw new InventorySourceError("provider_exists", "An inventory source already exists for this provider");
  }

  const credentials = body.credentials ?? {};
  const validation = validateProviderPayload(body.provider, body.config, credentials);
  if (!validation.ok) {
    throw new InventorySourceError("invalid_payload", validation.message);
  }

  const row = await insertInventorySource({
    userId,
    provider: body.provider,
    displayName: body.displayName?.trim() || defaultDisplayName(body.provider),
    connectionStatus: "configuring",
    config: body.config,
    credentialsEnc: encryptSourceCredentials(credentials),
    integrationId: body.integrationId ?? null,
    isActive: true,
  });

  return toPublicInventorySource(row);
}

export async function updateSourceForUser(
  userId: string,
  sourceId: string,
  body: z.infer<typeof patchInventorySourceBodySchema>,
) {
  const existing = await getInventorySource(userId, sourceId);
  if (!existing) return null;

  const existingConfig = (existing.config || {}) as Record<string, unknown>;
  const incomingConfig = body.config as Record<string, unknown> | undefined;
  let nextConfig: Record<string, unknown> = incomingConfig
    ? { ...existingConfig, ...incomingConfig }
    : existingConfig;

  const origChanged =
    incomingConfig?.originatingSystemName != null &&
    String(incomingConfig.originatingSystemName).trim() !==
      String(existingConfig.originatingSystemName ?? "").trim();
  if (origChanged) {
    nextConfig = {
      ...nextConfig,
      initialImportComplete: false,
      maxModificationTimestamp: undefined,
      lastReconciliationAt: undefined,
    };
    delete nextConfig.maxModificationTimestamp;
    delete nextConfig.lastReconciliationAt;
  }
  const existingDecrypted = decryptSourceCredentials(
    (existing.credentialsEnc || {}) as Record<string, unknown>,
  );
  const credentialsPatch =
    body.credentials &&
    typeof body.credentials.accessToken === "string" &&
    body.credentials.accessToken.trim() === ""
      ? undefined
      : body.credentials;
  const nextCreds = credentialsPatch
    ? encryptSourceCredentials(credentialsPatch)
    : (existing.credentialsEnc as Record<string, unknown>);

  const validation = validateProviderPayload(
    existing.provider as InventoryProvider,
    nextConfig,
    credentialsPatch ?? existingDecrypted,
  );
  if (!validation.ok) {
    throw new InventorySourceError("invalid_payload", validation.message);
  }

  const patch: Partial<typeof inventorySources.$inferInsert> = {
    ...(body.displayName !== undefined ? { displayName: body.displayName.trim() } : {}),
    ...(body.config !== undefined ? { config: nextConfig } : {}),
    ...(credentialsPatch !== undefined ? { credentialsEnc: nextCreds } : {}),
    ...(body.integrationId !== undefined ? { integrationId: body.integrationId } : {}),
    ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
  };
  if (body.connectionStatus !== undefined) {
    patch.connectionStatus = body.connectionStatus;
  } else if (credentialsPatch !== undefined || body.config !== undefined) {
    patch.connectionStatus = "configuring";
  }

  if (origChanged) {
    patch.lastSyncStatus = null;
    patch.lastSyncAt = null;
    patch.lastSyncError = null;
    patch.lastSyncStats = null;
  }

  const row = await patchInventorySource(sourceId, userId, patch);
  if (!row) return null;
  const counts = await countListingsBySourceForUser(userId);
  return toPublicInventorySource(row, counts[row.id] ?? 0);
}

export async function removeSourceForUser(userId: string, sourceId: string): Promise<boolean> {
  return deleteInventorySource(sourceId, userId);
}

export async function validateSourceConnection(userId: string, sourceId: string) {
  const source = await getInventorySource(userId, sourceId);
  if (!source) return null;

  const adapter = getInventoryProviderAdapter(source.provider as InventoryProvider);
  const ctx = buildAdapterContext(source);
  const result = await adapter.validateConnection(ctx);

  const connectionStatus = result.ok ? "connected" : "error";
  await patchInventorySource(sourceId, userId, {
    connectionStatus,
    lastSyncError: result.ok ? null : result.message ?? "Validation failed",
  });

  return { ...result, connectionStatus };
}

export class InventorySourceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "InventorySourceError";
  }
}
