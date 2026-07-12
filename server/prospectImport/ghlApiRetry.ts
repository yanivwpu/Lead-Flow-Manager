import type { ProspectImportContactFilter } from "@shared/prospectImport";
import {
  PROSPECT_IMPORT_ENTIRE_SCAN_MAX,
  type ProspectImportScanScope,
} from "@shared/prospectImport";

export class GhlApiError extends Error {
  readonly status: number;
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.name = "GhlApiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export function parseRetryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after") || headers.get("Retry-After");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dateMs = Date.parse(raw);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

export function isGhlRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export function isGhlAuthError(status: number): boolean {
  return status === 401 || status === 403;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchGhlWithRetry(
  url: string,
  token: string,
  init?: RequestInit,
  opts?: {
    fetchImpl?: typeof fetch;
    maxRetries?: number;
    apiVersion?: string;
  },
): Promise<{ data: unknown; status: number }> {
  const fetchFn = opts?.fetchImpl ?? fetch;
  const maxRetries = opts?.maxRetries ?? 5;
  const apiVersion = opts?.apiVersion ?? "2021-07-28";

  let attempt = 0;
  while (true) {
    const resp = await fetchFn(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: apiVersion,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });

    if (resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return { data, status: resp.status };
    }

    const body = await resp.text().catch(() => "");
    const message = `GHL API ${resp.status}: ${body.substring(0, 400)}`;

    if (isGhlAuthError(resp.status)) {
      throw new GhlApiError(message, resp.status, false);
    }

    if (!isGhlRetryableStatus(resp.status) || attempt >= maxRetries) {
      throw new GhlApiError(message, resp.status, isGhlRetryableStatus(resp.status));
    }

    const retryAfterMs = parseRetryAfterMs(resp.headers);
    const backoffMs =
      retryAfterMs ??
      Math.min(30_000, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
    await sleep(backoffMs);
    attempt += 1;
  }
}

export function resolveScanTargetContacts(scanScope: ProspectImportScanScope): number {
  if (scanScope === "entire") return PROSPECT_IMPORT_ENTIRE_SCAN_MAX;
  return scanScope;
}

export function normalizeProspectImportFilters(
  filters: ProspectImportContactFilter,
): ProspectImportContactFilter {
  const importLimit = Math.min(Math.max(filters.importLimit ?? 100, 1), 1000);
  const scanScope = filters.scanScope ?? 1000;
  return { ...filters, importLimit, scanScope };
}

export function buildGhlApiSearchQuery(filters: ProspectImportContactFilter): string | undefined {
  const q = String(filters.search || "").trim();
  return q || undefined;
}

export function buildProspectImportFilterFingerprint(params: {
  integrationId: string;
  locationId: string;
  filters: ProspectImportContactFilter;
}): string {
  const normalized = normalizeProspectImportFilters(params.filters);
  const payload = JSON.stringify({
    integrationId: params.integrationId.trim(),
    locationId: params.locationId.trim(),
    filters: {
      tags: [...(normalized.tags ?? [])].sort(),
      pipelineId: normalized.pipelineId ?? null,
      pipelineStageId: normalized.pipelineStageId ?? null,
      contactSource: normalized.contactSource ?? null,
      assignedUserId: normalized.assignedUserId ?? null,
      createdAfter: normalized.createdAfter ?? null,
      createdBefore: normalized.createdBefore ?? null,
      lastActivityDays: normalized.lastActivityDays ?? null,
      hasEmail: normalized.hasEmail ?? null,
      hasPhone: normalized.hasPhone ?? null,
      hasBoth: normalized.hasBoth ?? null,
      search: normalized.search ?? null,
      scanScope: normalized.scanScope ?? null,
      importLimit: normalized.importLimit ?? null,
    },
  });

  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash * 31 + payload.charCodeAt(i)) >>> 0;
  }
  return `${params.integrationId}:${params.locationId}:${hash.toString(16)}`;
}
