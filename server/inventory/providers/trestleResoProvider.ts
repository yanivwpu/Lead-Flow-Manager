import {
  trestleCredentialsSchema,
  trestleSourceConfigSchema,
} from "@shared/inventory/inventoryListingSchema";
import { buildODataFilter, escapeODataString } from "@shared/inventory/reso/resoOData";
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
import { fetchTrestleAccessToken } from "./trestleAuth";

export const TRESTLE_ODATA_BASE = "https://api.cotality.com/trestle/odata";
export const TRESTLE_PAGE_SIZE = 1000;

/** Conservative defaults — Trestle quotas vary per feed (see response quota headers). */
export const TRESTLE_RATE_LIMITS: ResoEndpointConfig["rateLimits"] = {
  minIntervalMs: 500,
  perSecond: 2,
  perHour: 6000,
  perDay: 100000,
};

const trestlePropertyNormalizer: ResoPropertyNormalizerContract = {
  provider: "trestle",
  extractListingId: defaultResoListingId,
  resolveStatus(row) {
    return mapResoStandardStatus(row.StandardStatus);
  },
  extractPhotos(row) {
    return normalizeResoMediaItems(row.Media);
  },
};

export function normalizeTrestleProperty(raw: unknown, sourceMlsName?: string) {
  return normalizeResoPropertyRow(raw, trestlePropertyNormalizer, { sourceMlsName });
}

function buildTrestlePropertyFilter(
  originatingSystemName: string,
  mode: ResoSyncMode,
  maxModificationTimestamp: string | undefined,
  additionalFilter: string | undefined,
  scope: ReturnType<typeof readInventorySyncScope>,
): string {
  const clauses = [`OriginatingSystemName eq '${escapeODataString(originatingSystemName)}'`];

  if ((mode === "incremental" || mode === "initial") && maxModificationTimestamp) {
    clauses.push(`ModificationTimestamp gt ${maxModificationTimestamp}`);
  }

  if (additionalFilter?.trim()) {
    clauses.push(additionalFilter.trim());
  }

  const base = buildODataFilter(clauses);
  return appendScopeToPropertyFilter(base, mode, scope);
}

export function createTrestleResoProvider(
  ctx: InventoryAdapterContext,
  accessToken: string,
): ResoReplicationProviderContract {
  const cfg = trestleSourceConfigSchema.parse(ctx.config);

  return {
    getEndpointConfig(): ResoEndpointConfig {
      return {
        baseUrl: TRESTLE_ODATA_BASE,
        propertyResource: "Property",
        pageSize: TRESTLE_PAGE_SIZE,
        rateLimits: TRESTLE_RATE_LIMITS,
        providerLabel: "Trestle",
        modificationTimestampField: "ModificationTimestamp",
      };
    },
    getAuth(): ResoAuthConfig {
      return { type: "bearer", token: accessToken };
    },
    buildPropertyFilter(mode, maxModificationTimestamp) {
      return buildTrestlePropertyFilter(
        cfg.originatingSystemName,
        mode,
        maxModificationTimestamp,
        cfg.additionalFilter,
        readInventorySyncScope(cfg),
      );
    },
    resolveOrderBy(mode) {
      return mode === "initial" ? "ModificationTimestamp desc" : undefined;
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
      return normalizeTrestleProperty(raw, cfg.originatingSystemName);
    },
  };
}

async function resolveTrestleAccessToken(ctx: InventoryAdapterContext): Promise<string> {
  const creds = trestleCredentialsSchema.parse(ctx.credentials);
  return fetchTrestleAccessToken(ctx.source.id, creds.clientId, creds.clientSecret);
}

export async function fetchTrestleReplication(
  ctx: InventoryAdapterContext,
  options: ResoReplicationFetchOptions,
) {
  const accessToken = await resolveTrestleAccessToken(ctx);
  return runResoReplicationFetch(
    ctx.source.id,
    createTrestleResoProvider(ctx, accessToken),
    options,
  );
}

export async function validateTrestleResoConnection(ctx: InventoryAdapterContext) {
  const creds = trestleCredentialsSchema.safeParse(ctx.credentials);
  const cfg = trestleSourceConfigSchema.safeParse(ctx.config);
  if (!creds.success) {
    return { ok: false as const, message: "Missing Trestle client ID or client secret" };
  }
  if (!cfg.success) {
    return { ok: false as const, message: "Missing originating system name in source config" };
  }

  let accessToken: string;
  try {
    accessToken = await fetchTrestleAccessToken(
      ctx.source.id,
      creds.data.clientId,
      creds.data.clientSecret,
    );
  } catch (err) {
    return {
      ok: false as const,
      message: err instanceof Error ? err.message : "Trestle authentication failed",
    };
  }

  const filter = `OriginatingSystemName eq '${escapeODataString(cfg.data.originatingSystemName)}'`;
  const probe = await runResoConnectionProbe(
    ctx.source.id,
    createTrestleResoProvider(ctx, accessToken),
    filter,
  );

  if (!probe.ok) {
    return { ok: false as const, message: probe.message };
  }
  return {
    ok: true as const,
    message: "Trestle connection verified",
    details: { sampleRows: probe.sampleRows },
  };
}
