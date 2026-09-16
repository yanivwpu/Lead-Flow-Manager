import { z } from "zod";
import {
  inventoryConnectionStatusSchema,
  inventoryProviderSchema,
  providerSupportsListingSync,
  type InventoryProvider,
} from "@shared/inventory/inventoryProviderSchema";
import { mlsGridCredentialsSchema, mlsGridSourceConfigSchema, trestleCredentialsSchema, trestleSourceConfigSchema, bridgeInteractiveCredentialsSchema, bridgeInteractiveSourceConfigSchema } from "@shared/inventory/inventoryListingSchema";
import { inventorySources, type InventorySource } from "@shared/schema";
import {
  decryptSourceCredentials,
  deleteInventorySource,
  encryptSourceCredentials,
  getInventorySource,
  getInventorySourceByProvider,
  insertInventorySource,
  countListingStatsBySourceForUser,
  listInventorySources,
  patchInventorySource,
  type SourceListingStats,
} from "./inventoryDb";
import { DEFAULT_MAX_LISTINGS, readInventorySyncScope } from "@shared/inventory/reso/resoSyncScope";
import { getInventoryProviderAdapter } from "./inventoryProviderRegistry";
import type { InventoryAdapterContext } from "./providers/types";
import {
  buildResoBearerAuthorization,
  normalizeInventorySecretValue,
} from "@shared/inventory/inventoryCredentialValue";
import {
  assertProductionDevSeedSourceAllowed,
} from "@shared/inventory/inventoryDevSeedGuard";
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

export type PublicInventoryListingStats = {
  activeForMatching: number;
  configuredCap: number;
  totalSynced: number;
  inactiveOffMarket: number;
};

export function toPublicInventorySource(
  source: InventorySource,
  listingStats: SourceListingStats = { total: 0, matchable: 0 },
) {
  const creds = (source.credentialsEnc || {}) as Record<string, unknown>;
  const hasCredentials = inventorySourceHasSyncCredentials(source.provider as InventoryProvider, creds);
  const rawConfig = (source.config || {}) as Record<string, unknown>;
  const config = { ...rawConfig };
  const configuredCap = readInventorySyncScope(rawConfig).maxListings;
  const inventoryStats: PublicInventoryListingStats = {
    activeForMatching: listingStats.matchable,
    configuredCap,
    totalSynced: listingStats.total,
    inactiveOffMarket: Math.max(0, listingStats.total - listingStats.matchable),
  };
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
    hasCredentials,
    listingCount: listingStats.total,
    inventoryStats,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

/** Whether decrypted inventory_sources.credentialsEnc has the token(s) required for listing sync. */
export function inventorySourceHasSyncCredentials(
  provider: InventoryProvider,
  creds: Record<string, unknown>,
): boolean {
  if (provider === "trestle") {
    return (
      typeof creds.clientId === "string" &&
      creds.clientId.length > 0 &&
      typeof creds.clientSecret === "string" &&
      creds.clientSecret.length > 0
    );
  }
  if (provider === "mls_grid") {
    return typeof creds.accessToken === "string" && creds.accessToken.length > 0;
  }
  if (provider === "bridge_interactive") {
    return typeof creds.serverToken === "string" && creds.serverToken.length > 0;
  }
  return false;
}

function defaultDisplayName(provider: InventoryProvider): string {
  if (provider === "mls_grid") {
    return IS_PRODUCTION ? "My MLS inventory" : "Primary inventory source";
  }
  if (provider === "trestle") {
    return IS_PRODUCTION ? "My Trestle inventory" : "Trestle inventory source";
  }
  if (provider === "bridge_interactive") {
    return IS_PRODUCTION ? "My Bridge inventory" : "Bridge inventory source";
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
  if (provider === "trestle") {
    const cfg = trestleSourceConfigSchema.safeParse(config);
    if (!cfg.success) {
      return { ok: false, message: "Originating system name is required." };
    }
    const creds = trestleCredentialsSchema.safeParse(credentials);
    if (!creds.success) {
      return { ok: false, message: "Trestle client ID and client secret are required when connecting a new source." };
    }
  }
  if (provider === "bridge_interactive") {
    const cfg = bridgeInteractiveSourceConfigSchema.safeParse(config);
    if (!cfg.success) {
      return { ok: false, message: "Dataset ID is required." };
    }
    const creds = bridgeInteractiveCredentialsSchema.safeParse(credentials);
    if (!creds.success) {
      return { ok: false, message: "Server token is required when connecting a new source." };
    }
  }
  return { ok: true };
}

/** Merge credential patches. Blank secrets keep the existing encrypted values. */
export function mergeCredentialsPatch(
  provider: InventoryProvider,
  existing: Record<string, unknown>,
  patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!patch) return undefined;
  const normalized = normalizeCredentialPatchValues(patch);

  if (provider === "mls_grid") {
    if (typeof normalized.accessToken === "string" && normalized.accessToken === "") {
      return undefined;
    }
    return normalized;
  }

  if (provider === "trestle") {
    const hasClientId = typeof normalized.clientId === "string" && normalized.clientId !== "";
    const hasClientSecret = typeof normalized.clientSecret === "string" && normalized.clientSecret !== "";
    if (!hasClientId && !hasClientSecret) return undefined;

    const next: Record<string, unknown> = { ...existing, ...normalized };
    if (typeof normalized.clientSecret === "string" && normalized.clientSecret === "") {
      next.clientSecret = existing.clientSecret;
    }
    if (typeof normalized.clientId === "string" && normalized.clientId === "") {
      next.clientId = existing.clientId;
    }
    return next;
  }

  if (provider === "bridge_interactive") {
    if (typeof normalized.serverToken !== "string" || normalized.serverToken === "") {
      return undefined;
    }
    return { ...normalized, serverToken: normalized.serverToken };
  }

  return normalized;
}

function normalizeCredentialPatchValues(patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...patch };
  if (typeof next.serverToken === "string") {
    next.serverToken = normalizeInventorySecretValue(next.serverToken);
  }
  if (typeof next.accessToken === "string") {
    next.accessToken = normalizeInventorySecretValue(next.accessToken);
  }
  if (typeof next.clientSecret === "string") {
    next.clientSecret = normalizeInventorySecretValue(next.clientSecret);
  }
  if (typeof next.clientId === "string") {
    next.clientId = next.clientId.trim();
  }
  return next;
}

/**
 * Same persist + decrypt path used by PATCH then the immediately following sync.
 * Never returns plaintext tokens — only safe booleans.
 */
export function applyBridgeCredentialReplacementForSync(input: {
  existingCredentialsEnc: Record<string, unknown>;
  patchCredentials?: Record<string, unknown>;
}): {
  credentialsUpdated: boolean;
  credentialPresent: boolean;
  tokenReplaced: boolean;
  usedStaleCredentials: boolean;
  authorizationHeaderWellFormed: boolean;
} {
  const existingDecrypted = decryptSourceCredentials(input.existingCredentialsEnc);
  const credentialsPatch = mergeCredentialsPatch(
    "bridge_interactive",
    existingDecrypted,
    input.patchCredentials,
  );
  const nextEnc = credentialsPatch
    ? encryptSourceCredentials(credentialsPatch)
    : input.existingCredentialsEnc;
  const decryptedForSync = decryptSourceCredentials(nextEnc);
  const token = typeof decryptedForSync.serverToken === "string" ? decryptedForSync.serverToken : "";
  const previous = typeof existingDecrypted.serverToken === "string" ? existingDecrypted.serverToken : "";
  const authorization = token ? buildResoBearerAuthorization(token) : "";
  const tokenReplaced = Boolean(credentialsPatch) && token.length > 0 && token !== previous;
  return {
    credentialsUpdated: credentialsPatch !== undefined,
    credentialPresent: token.length > 0,
    tokenReplaced,
    usedStaleCredentials: credentialsPatch === undefined,
    authorizationHeaderWellFormed:
      authorization.startsWith("Bearer ") &&
      authorization.length > "Bearer ".length &&
      !/^Bearer\s+Bearer\s+/i.test(authorization),
  };
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
  const { recoverStaleInventorySync } = await import("./inventorySyncService");
  const recovered: typeof rows = [];
  for (const row of rows) {
    recovered.push(row.lastSyncStatus === "running" ? await recoverStaleInventorySync(row) : row);
  }
  const counts = await countListingStatsBySourceForUser(userId);
  return recovered.map((row) =>
    toPublicInventorySource(row, counts[row.id] ?? { total: 0, matchable: 0 }),
  );
}

export function isInventorySourcesUserProviderUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    constraint?: string;
    message?: string;
    cause?: { code?: string; constraint?: string; message?: string };
  };
  const nested = e.cause && typeof e.cause === "object" ? e.cause : null;
  const code = e.code ?? nested?.code;
  const constraint = `${e.constraint ?? ""} ${nested?.constraint ?? ""}`;
  const message = `${e.message ?? ""} ${nested?.message ?? ""} ${String(error)}`;
  if (constraint.includes("inventory_sources_user_provider_unique")) return true;
  if (code === "23505" && message.includes("inventory_sources_user_provider_unique")) return true;
  if (
    code === "23505" &&
    /inventory_sources/i.test(message) &&
    /unique|duplicate/i.test(message)
  ) {
    return true;
  }
  return false;
}

export function resolveCreateInventorySourcePlan(
  existingOwned: { id: string } | undefined,
): { mode: "update"; sourceId: string } | { mode: "insert" } {
  return existingOwned?.id
    ? { mode: "update", sourceId: existingOwned.id }
    : { mode: "insert" };
}

const DEFAULT_DISPLAY_NAMES: Record<string, string[]> = {
  mls_grid: ["My MLS inventory", "Primary inventory source"],
  trestle: ["My Trestle inventory", "Trestle inventory source"],
  bridge_interactive: ["My Bridge inventory", "Bridge inventory source"],
};

export function isDefaultInventoryDisplayName(
  provider: InventoryProvider,
  name: string | undefined,
): boolean {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return true;
  return (DEFAULT_DISPLAY_NAMES[provider] ?? []).includes(trimmed) || trimmed === defaultDisplayName(provider);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const next = value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  return next.length > 0 ? next : undefined;
}

/** Config keys a stale/default create is allowed to write onto an existing owned source. */
export function meaningfulInventoryConfigPatch(
  config: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!config || Object.keys(config).length === 0) return undefined;
  const next: Record<string, unknown> = {};
  const datasetId = nonEmptyString(config.datasetId);
  if (datasetId) next.datasetId = datasetId;
  const originatingSystemName = nonEmptyString(config.originatingSystemName);
  if (originatingSystemName) next.originatingSystemName = originatingSystemName;
  const syncCities = nonEmptyStringArray(config.syncCities);
  if (syncCities) next.syncCities = syncCities;
  const syncZipCodes = nonEmptyStringArray(config.syncZipCodes);
  if (syncZipCodes) next.syncZipCodes = syncZipCodes;
  if (
    typeof config.maxListings === "number" &&
    Number.isFinite(config.maxListings) &&
    config.maxListings !== DEFAULT_MAX_LISTINGS
  ) {
    next.maxListings = config.maxListings;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function credentialsAreBlankOrAbsent(credentials: Record<string, unknown> | undefined): boolean {
  if (!credentials) return true;
  const values = Object.values(credentials);
  if (values.length === 0) return true;
  return values.every((v) => v == null || (typeof v === "string" && v.trim() === ""));
}

/**
 * Conservative patch when POST hits an already-owned provider.
 * Empty/default form fields must not clobber display name, market scope,
 * dataset ID, credentials, connection status, or sync metadata.
 */
export function buildDuplicateCreateRecoveryPatch(
  provider: InventoryProvider,
  body: z.infer<typeof createInventorySourceBodySchema>,
): z.infer<typeof patchInventorySourceBodySchema> {
  const patch: z.infer<typeof patchInventorySourceBodySchema> = {};
  if (!isDefaultInventoryDisplayName(provider, body.displayName)) {
    patch.displayName = body.displayName!.trim();
  }
  const config = meaningfulInventoryConfigPatch(body.config as Record<string, unknown> | undefined);
  if (config) patch.config = config;
  if (!credentialsAreBlankOrAbsent(body.credentials as Record<string, unknown> | undefined)) {
    patch.credentials = body.credentials;
  }
  if (typeof body.integrationId === "string" && body.integrationId.trim().length > 0) {
    patch.integrationId = body.integrationId;
  }
  return patch;
}

export function duplicateCreateRecoveryPatchIsEmpty(
  patch: z.infer<typeof patchInventorySourceBodySchema>,
): boolean {
  return (
    patch.displayName === undefined &&
    patch.config === undefined &&
    patch.credentials === undefined &&
    patch.integrationId === undefined &&
    patch.connectionStatus === undefined &&
    patch.isActive === undefined
  );
}

export async function createSourceForUser(
  userId: string,
  body: z.infer<typeof createInventorySourceBodySchema>,
) {
  const existing = await getInventorySourceByProvider(userId, body.provider);
  const plan = resolveCreateInventorySourcePlan(existing);
  if (plan.mode === "update") {
    const recovered = await recoverOwnedSourceFromDuplicateCreate(userId, plan.sourceId, body);
    if (recovered) return recovered;
  }

  const credentials = body.credentials ?? {};
  const devSeedGuard = assertProductionDevSeedSourceAllowed(body.config as Record<string, unknown>);
  if (!devSeedGuard.ok) {
    throw new InventorySourceError(devSeedGuard.code, devSeedGuard.message);
  }

  const validation = validateProviderPayload(body.provider, body.config, credentials);
  if (!validation.ok) {
    throw new InventorySourceError("invalid_payload", validation.message);
  }

  try {
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
  } catch (error) {
    if (!isInventorySourcesUserProviderUniqueViolation(error)) {
      throw error;
    }
    const raced = await getInventorySourceByProvider(userId, body.provider);
    if (!raced) {
      throw new InventorySourceError(
        "provider_exists",
        "An inventory source already exists for this provider",
      );
    }
    const recovered = await recoverOwnedSourceFromDuplicateCreate(userId, raced.id, body);
    if (!recovered) {
      throw new InventorySourceError(
        "provider_exists",
        "An inventory source already exists for this provider",
      );
    }
    return recovered;
  }
}

async function recoverOwnedSourceFromDuplicateCreate(
  userId: string,
  sourceId: string,
  body: z.infer<typeof createInventorySourceBodySchema>,
) {
  const existing = await getInventorySource(userId, sourceId);
  if (!existing) return null;
  const patch = buildDuplicateCreateRecoveryPatch(existing.provider as InventoryProvider, body);
  if (duplicateCreateRecoveryPatchIsEmpty(patch)) {
    const counts = await countListingStatsBySourceForUser(userId);
    return toPublicInventorySource(existing, counts[existing.id] ?? { total: 0, matchable: 0 });
  }
  return updateSourceForUser(userId, sourceId, patch, { preserveRuntimeState: true });
}

export async function updateSourceForUser(
  userId: string,
  sourceId: string,
  body: z.infer<typeof patchInventorySourceBodySchema>,
  options?: { preserveRuntimeState?: boolean },
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
  const datasetChanged =
    incomingConfig?.datasetId != null &&
    String(incomingConfig.datasetId).trim() !== String(existingConfig.datasetId ?? "").trim();
  const feedIdentityChanged = origChanged || datasetChanged;
  if (feedIdentityChanged && !options?.preserveRuntimeState) {
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
  const credentialsPatch = mergeCredentialsPatch(
    existing.provider as InventoryProvider,
    existingDecrypted,
    body.credentials as Record<string, unknown> | undefined,
  );
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

  const devSeedGuard = assertProductionDevSeedSourceAllowed(nextConfig);
  if (!devSeedGuard.ok) {
    throw new InventorySourceError(devSeedGuard.code, devSeedGuard.message);
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
  } else if (!options?.preserveRuntimeState && (credentialsPatch !== undefined || body.config !== undefined)) {
    patch.connectionStatus = "configuring";
  }

  if (feedIdentityChanged && !options?.preserveRuntimeState) {
    patch.lastSyncStatus = null;
    patch.lastSyncAt = null;
    patch.lastSyncError = null;
    patch.lastSyncStats = null;
  }

  const row = await patchInventorySource(sourceId, userId, patch);
  if (!row) return null;
  const counts = await countListingStatsBySourceForUser(userId);
  return toPublicInventorySource(row, counts[row.id] ?? { total: 0, matchable: 0 });
}

export async function removeSourceForUser(userId: string, sourceId: string): Promise<boolean> {
  return deleteInventorySource(sourceId, userId);
}

export async function validateSourceConnection(userId: string, sourceId: string) {
  const source = await getInventorySource(userId, sourceId);
  if (!source) return null;

  const devSeedGuard = assertProductionDevSeedSourceAllowed(
    (source.config || {}) as Record<string, unknown>,
  );
  if (!devSeedGuard.ok) {
    return { ok: false, message: devSeedGuard.message, connectionStatus: source.connectionStatus };
  }

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
