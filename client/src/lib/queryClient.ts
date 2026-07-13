import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = ((await res.text()) || res.statusText || "").trim();
    let message = raw;
    try {
      const j = JSON.parse(raw) as { error?: string; message?: string; metaCode?: number };
      if (typeof j?.error === "string" && j.error.trim()) {
        message = j.error.trim();
      } else if (typeof j?.message === "string" && j.message.trim()) {
        message = j.message.trim();
      }
      if (j?.metaCode != null && typeof j.metaCode === "number") {
        message = `${message} (WhatsApp error ${j.metaCode})`;
      }
    } catch {
      if (raw.length > 500) message = raw.slice(0, 500) + "…";
      else message = raw;
    }
    throw new Error(`${res.status}: ${message}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    const low = msg.toLowerCase();
    if (
      low.includes("failed to fetch") ||
      low.includes("load failed") ||
      low.includes("networkerror") ||
      low.includes("network request failed")
    ) {
      throw new Error(
        "Network error: the request did not reach the server. Check your connection, VPN, or try again."
      );
    }
    throw new Error(msg || "Request failed");
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      /** User-specific JSON must not be served from disk/bfcache after mutations (e.g. template sync). */
      cache: "no-store",
      signal,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

export const QUERY_STALE_TIMES = {
  static: Infinity,
  subscription: 10 * 60 * 1000,
  chats: 30 * 1000,
  status: 60 * 1000,
  user: 5 * 60 * 1000,
};
