import {
  bridgeInteractiveCredentialsSchema,
  bridgeInteractiveSourceConfigSchema,
} from "@shared/inventory/inventoryListingSchema";
import { buildODataFilter } from "@shared/inventory/reso/resoOData";
import {
  appendScopeToPropertyFilter,
  buildSyncableStandardStatusFilter,
  readInventorySyncScope,
} from "@shared/inventory/reso/resoSyncScope";
import {
  defaultResoListingId,
  mapResoStandardStatus,
  normalizeResoMediaItems,
  normalizeResoPropertyRow,
  type ResoPropertyNormalizerContract,
} from "@shared/inventory/reso/resoNormalizer";
import type {
  ResoAuthConfig,
  ResoEndpointConfig,
  ResoPropertyQueryExtras,
  ResoReplicationProviderContract,
  ResoReplicationFetchOptions,
} from "@shared/inventory/reso/resoProviderContract";
import type { ResoSyncMode } from "@shared/inventory/reso/resoSyncTypes";
import type { InventoryAdapterContext } from "./types";
import { runResoConnectionProbe, runResoReplicationFetch } from "../reso/resoReplicationEngine";

export const BRIDGE_ODATA_BASE = "https://api.bridgedataoutput.com/api/v2/OData";
export const BRIDGE_REPLICATION_PAGE_SIZE = 2000;
export const BRIDGE_STANDARD_PAGE_SIZE = 200;
export const BRIDGE_MODIFICATION_FIELD = "BridgeModificationTimestamp";

/** Bridge default: 5,000/hr, burst ~334/min per platform docs. */
export const BRIDGE_RATE_LIMITS: ResoEndpointConfig["rateLimits"] = {
  minIntervalMs: 200,
  perSecond: 5,
  perHour: 5000,
  perDay: 100000,
};

const bridgePropertyNormalizer: ResoPropertyNormalizerContract = {
  provider: "bridge_interactive",
  extractListingId: defaultResoListingId,
  resolveStatus(row) {
    return mapResoStandardStatus(row.StandardStatus);
  },
  extractPhotos(row) {
    return normalizeResoMediaItems(row.Media);
  },
};

export function normalizeBridgeInteractiveProperty(raw: unknown) {
  return normalizeResoPropertyRow(raw, bridgePropertyNormalizer, {
    modificationTimestampField: BRIDGE_MODIFICATION_FIELD,
  });
}

function buildBridgePropertyFilter(
  mode: ResoSyncMode,
  maxModificationTimestamp: string | undefined,
  additionalFilter: string | undefined,
  scope: ReturnType<typeof readInventorySyncScope>,
): string {
  const clauses: string[] = [];

  if ((mode === "incremental" || mode === "initial") && maxModificationTimestamp) {
    clauses.push(`${BRIDGE_MODIFICATION_FIELD} gt ${maxModificationTimestamp}`);
  }

  if (additionalFilter?.trim()) {
    clauses.push(additionalFilter.trim());
  }

  const base = buildODataFilter(clauses);
  return appendScopeToPropertyFilter(base, mode, scope);
}

export function createBridgeInteractiveResoProvider(
  ctx: InventoryAdapterContext,
): ResoReplicationProviderContract {
  const creds = bridgeInteractiveCredentialsSchema.parse(ctx.credentials);
  const cfg = bridgeInteractiveSourceConfigSchema.parse(ctx.config);
  const datasetBaseUrl = `${BRIDGE_ODATA_BASE}/${cfg.datasetId}`;

  return {
    getEndpointConfig(): ResoEndpointConfig {
      return {
        baseUrl: datasetBaseUrl,
        propertyResource: "Property/replication",
        pageSize: BRIDGE_REPLICATION_PAGE_SIZE,
        rateLimits: BRIDGE_RATE_LIMITS,
        providerLabel: "Bridge Interactive",
        modificationTimestampField: BRIDGE_MODIFICATION_FIELD,
      };
    },
    getAuth(): ResoAuthConfig {
      return { type: "bearer", token: creds.serverToken };
    },
    resolvePropertyResource(mode) {
      return mode === "reconciliation" ? "Property" : "Property/replication";
    },
    resolvePageSize(mode) {
      return mode === "reconciliation" ? BRIDGE_STANDARD_PAGE_SIZE : BRIDGE_REPLICATION_PAGE_SIZE;
    },
    resolveOrderBy(mode) {
      return mode === "initial" ? `${BRIDGE_MODIFICATION_FIELD} desc` : undefined;
    },
    buildPropertyFilter(mode, maxModificationTimestamp) {
      return buildBridgePropertyFilter(
        mode,
        maxModificationTimestamp,
        cfg.additionalFilter,
        readInventorySyncScope(cfg),
      );
    },
    buildPropertyQueryExtras(mode): ResoPropertyQueryExtras {
      if (mode === "reconciliation") {
        return { select: "ListingId,ListingKey" };
      }
      if (cfg.expandMedia === false) {
        return { unselect: "Media" };
      }
      return {};
    },
    extractListingId(raw) {
      if (!raw || typeof raw !== "object") return null;
      return defaultResoListingId(raw as Record<string, unknown>);
    },
    normalizeProperty(raw) {
      return normalizeBridgeInteractiveProperty(raw);
    },
  };
}

export async function fetchBridgeInteractiveReplication(
  ctx: InventoryAdapterContext,
  options: ResoReplicationFetchOptions,
) {
  return runResoReplicationFetch(
    ctx.source.id,
    createBridgeInteractiveResoProvider(ctx),
    options,
  );
}

export async function validateBridgeInteractiveResoConnection(ctx: InventoryAdapterContext) {
  const creds = bridgeInteractiveCredentialsSchema.safeParse(ctx.credentials);
  const cfg = bridgeInteractiveSourceConfigSchema.safeParse(ctx.config);
  if (!creds.success) {
    return { ok: false as const, message: "Missing Bridge server token" };
  }
  if (!cfg.success) {
    return { ok: false as const, message: "Missing dataset ID in source config" };
  }

  const provider = createBridgeInteractiveResoProvider(ctx);
  const probe = await runResoConnectionProbe(
    ctx.source.id,
    provider,
    buildSyncableStandardStatusFilter(),
  );

  if (!probe.ok) {
    return { ok: false as const, message: probe.message };
  }
  return {
    ok: true as const,
    message: "Bridge Interactive connection verified",
    details: { sampleRows: probe.sampleRows, datasetId: cfg.data.datasetId },
  };
}
