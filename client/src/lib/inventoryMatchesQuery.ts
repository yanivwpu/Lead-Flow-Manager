import type { QueryClient } from "@tanstack/react-query";
import type { InventoryMatchesResponse } from "@shared/inventory/inventoryMatchTypes";
import { setBuyerMatchingTraceId } from "./buyerMatchingTraceStore";
import { INVENTORY_MATCH_PAGE_SIZE } from "./inventoryMatchUi";

export const INVENTORY_MATCHES_STALE_MS = 20_000;

export type InventoryMatchesFetchOptions = {
  offset?: number;
  limit?: number;
  shuffleSeed?: number;
  includeDiagnostics?: boolean;
};

export function inventoryMatchesQueryKey(
  contactId: string,
  options?: InventoryMatchesFetchOptions,
) {
  return [`/api/contacts/${contactId}/inventory-matches`, options ?? {}] as const;
}

export function inventoryMatchesQueryKeyContactId(queryKey: readonly unknown[]): string | null {
  const key = queryKey[0];
  if (typeof key !== "string") return null;
  const match = key.match(/^\/api\/contacts\/([^/]+)\/inventory-matches$/);
  return match?.[1] ?? null;
}

/** Keep cached matches only while refetching the same contact — never across contacts. */
export function inventoryMatchesPlaceholderData(
  contactId: string,
  previousData: InventoryMatchesResponse | undefined,
  previousQuery: { queryKey?: readonly unknown[] } | undefined,
): InventoryMatchesResponse | undefined {
  const prevContactId = inventoryMatchesQueryKeyContactId(previousQuery?.queryKey ?? []);
  if (prevContactId && prevContactId === contactId) return previousData;
  return undefined;
}

export class InventoryMatchesFetchError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "InventoryMatchesFetchError";
    this.status = status;
  }
}

export async function fetchInventoryMatches(
  contactId: string,
  options?: InventoryMatchesFetchOptions,
): Promise<InventoryMatchesResponse> {
  const params = new URLSearchParams();
  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? INVENTORY_MATCH_PAGE_SIZE;
  params.set("offset", String(offset));
  params.set("limit", String(limit));
  if (options?.shuffleSeed != null && Number.isFinite(options.shuffleSeed)) {
    params.set("shuffleSeed", String(options.shuffleSeed));
  }
  if (options?.includeDiagnostics) {
    params.set("includeDiagnostics", "1");
  }

  const res = await fetch(
    `/api/contacts/${contactId}/inventory-matches?${params.toString()}`,
    {
      credentials: "include",
      cache: "no-store",
    },
  );
  if (res.status === 401) throw new InventoryMatchesFetchError("Unauthorized", 401);
  if (res.status === 404) throw new InventoryMatchesFetchError("Contact not found", 404);
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new InventoryMatchesFetchError(err.error || "Failed to load matches", res.status);
  }
  const body = (await res.json()) as InventoryMatchesResponse;
  if (body.buyerMatchingTraceId) {
    setBuyerMatchingTraceId(contactId, body.buyerMatchingTraceId);
  }
  return body;
}

export function isRateLimitedInventoryMatchesError(error: unknown): boolean {
  if (error instanceof InventoryMatchesFetchError) return error.status === 429;
  if (error instanceof Error) {
    return error.message.includes("429") || /too many requests/i.test(error.message);
  }
  return false;
}

export function inventoryMatchesHasDisplayableResults(
  data: InventoryMatchesResponse | undefined,
): boolean {
  return (data?.matches?.length ?? 0) > 0;
}

const REFETCH_DEBOUNCE_MS = 1_500;
const pendingRefetchTimers = new Map<string, ReturnType<typeof setTimeout>>();
const inFlightRefetches = new Set<string>();

/**
 * Coalesce inventory-match refetches per contact (WS + preference saves + invalidations).
 */
export function scheduleInventoryMatchesRefetch(
  queryClient: QueryClient,
  contactId: string,
  options?: { debounceMs?: number; clearCachedMatches?: boolean },
): void {
  if (!contactId) return;
  const debounceMs = options?.debounceMs ?? REFETCH_DEBOUNCE_MS;
  if (options?.clearCachedMatches) {
    queryClient.removeQueries({
      predicate: (q) => inventoryMatchesQueryKeyContactId(q.queryKey) === contactId,
    });
  }
  const pending = pendingRefetchTimers.get(contactId);
  if (pending) clearTimeout(pending);

  pendingRefetchTimers.set(
    contactId,
    setTimeout(() => {
      pendingRefetchTimers.delete(contactId);
      if (inFlightRefetches.has(contactId)) return;

      inFlightRefetches.add(contactId);
      void queryClient
        .invalidateQueries({
          predicate: (q) => inventoryMatchesQueryKeyContactId(q.queryKey) === contactId,
          refetchType: "active",
        })
        .finally(() => {
          inFlightRefetches.delete(contactId);
        });
    }, debounceMs),
  );
}

export function inventoryMatchesRetryDelay(attempt: number, error: unknown): number {
  if (isRateLimitedInventoryMatchesError(error)) {
    return Math.min(2_000 * 2 ** attempt, 15_000);
  }
  return 1_000;
}

export function shouldRetryInventoryMatches(failureCount: number, error: unknown): boolean {
  if (isRateLimitedInventoryMatchesError(error)) return failureCount < 3;
  return failureCount < 1;
}
