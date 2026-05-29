import {
  mlsGridCredentialsSchema,
  mlsGridSourceConfigSchema,
} from "@shared/inventory/inventoryListingSchema";
import { buildODataFilter, escapeODataString } from "@shared/inventory/reso/resoOData";
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

export const MLS_GRID_BASE = "https://api.mlsgrid.com/v2";
export const MLS_GRID_PAGE_SIZE = 1000;

export const MLS_GRID_RATE_LIMITS: ResoEndpointConfig["rateLimits"] = {
  minIntervalMs: 500,
  perSecond: 2,
  perHour: 7200,
  perDay: 40000,
};

const mlsGridPropertyNormalizer: ResoPropertyNormalizerContract = {
  provider: "mls_grid",
  extractListingId: defaultResoListingId,
  resolveStatus(row) {
    if (row.MlgCanView === false) return "inactive";
    return mapResoStandardStatus(row.StandardStatus);
  },
  extractPhotos(row) {
    return normalizeResoMediaItems(row.Media);
  },
};

export function normalizeMlsGridProperty(raw: unknown) {
  return normalizeResoPropertyRow(raw, mlsGridPropertyNormalizer);
}

function buildMlsGridPropertyFilter(
  originatingSystemName: string,
  mode: ResoSyncMode,
  maxModificationTimestamp?: string,
  additionalFilter?: string,
): string {
  const clauses = [`OriginatingSystemName eq '${escapeODataString(originatingSystemName)}'`];

  if (mode === "initial" || mode === "reconciliation") {
    clauses.push("MlgCanView eq true");
  }

  if ((mode === "incremental" || mode === "initial") && maxModificationTimestamp) {
    clauses.push(`ModificationTimestamp gt ${maxModificationTimestamp}`);
  }

  if (additionalFilter?.trim()) {
    clauses.push(additionalFilter.trim());
  }

  return buildODataFilter(clauses);
}

/** Build MLS Grid RESO replication contract from adapter context. */
export function createMlsGridResoProvider(ctx: InventoryAdapterContext): ResoReplicationProviderContract {
  const creds = mlsGridCredentialsSchema.parse(ctx.credentials);
  const cfg = mlsGridSourceConfigSchema.parse(ctx.config);

  return {
    getEndpointConfig(): ResoEndpointConfig {
      return {
        baseUrl: MLS_GRID_BASE,
        propertyResource: "Property",
        pageSize: MLS_GRID_PAGE_SIZE,
        rateLimits: MLS_GRID_RATE_LIMITS,
        providerLabel: "MLS Grid",
        modificationTimestampField: "ModificationTimestamp",
      };
    },
    getAuth(): ResoAuthConfig {
      return { type: "bearer", token: creds.accessToken };
    },
    buildPropertyFilter(mode, maxModificationTimestamp) {
      return buildMlsGridPropertyFilter(
        cfg.originatingSystemName,
        mode,
        maxModificationTimestamp,
        cfg.additionalFilter,
      );
    },
    buildPropertyQueryExtras(mode): ResoPropertyQueryExtras {
      if (mode === "reconciliation") {
        return { select: "ListingId,ListingKey" };
      }
      if (cfg.expandMedia !== false) {
        return { expand: "Media" };
      }
      return {};
    },
    extractListingId(raw) {
      if (!raw || typeof raw !== "object") return null;
      return defaultResoListingId(raw as Record<string, unknown>);
    },
    normalizeProperty(raw) {
      return normalizeMlsGridProperty(raw);
    },
  };
}

export async function fetchMlsGridReplication(
  ctx: InventoryAdapterContext,
  options: ResoReplicationFetchOptions,
) {
  return runResoReplicationFetch(ctx.source.id, createMlsGridResoProvider(ctx), options);
}

export async function validateMlsGridResoConnection(ctx: InventoryAdapterContext) {
  const creds = mlsGridCredentialsSchema.safeParse(ctx.credentials);
  const cfg = mlsGridSourceConfigSchema.safeParse(ctx.config);
  if (!creds.success) {
    return { ok: false as const, message: "Missing MLS Grid access token" };
  }
  if (!cfg.success) {
    return { ok: false as const, message: "Missing originatingSystemName in source config" };
  }

  const filter = `OriginatingSystemName eq '${escapeODataString(cfg.data.originatingSystemName)}'`;
  const probe = await runResoConnectionProbe(
    ctx.source.id,
    createMlsGridResoProvider(ctx),
    filter,
  );

  if (!probe.ok) {
    return { ok: false as const, message: probe.message };
  }
  return {
    ok: true as const,
    message: "MLS Grid connection verified",
    details: { sampleRows: probe.sampleRows },
  };
}
