import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const PROSPECT_AI_STATUS_KEY = ["/api/growth-engines/prospect-ai/status"] as const;
export const PROSPECT_AI_ACTIVITY_KEY = ["/api/growth-engines/prospect-ai/activity"] as const;
export const PROSPECT_AI_WON_STATS_KEY = ["/api/growth-engines/prospect-ai/won/stats"] as const;
export const PROSPECT_AI_PATH = "/app/prospect-ai" as const;

export type ProspectAiBrainStatus = {
  configured: boolean;
  businessProfile: boolean;
  businessKnowledge: boolean;
  websiteKnowledge: boolean;
};

export type ProspectAiStatus = {
  activated: boolean;
  plan: string;
  monthlyQuota: number;
  used: number;
  remaining: number;
  aiBrain: ProspectAiBrainStatus;
};

export type ProspectAiDiscoverResult = {
  id: string;
  name?: string | null;
  businessName?: string | null;
  businessType?: string | null;
  location?: string | null;
  address?: string | null;
  website?: string | null;
  phone?: string | null;
  email?: string | null;
  [key: string]: unknown;
};

export type ProspectAiDiscoverResponse = {
  search: {
    id: string;
    businessType?: string;
    location?: string;
    radiusKm?: number | null;
    createdAt?: string;
    resultCount?: number;
  };
  results: ProspectAiDiscoverResult[];
  quota: {
    monthlyQuota: number;
    used: number;
    remaining: number;
  };
};

export type ProspectAiActivitySearch = {
  id: string;
  businessType?: string | null;
  location?: string | null;
  radiusKm?: number | null;
  createdAt?: string | null;
  resultCount?: number | null;
  status?: string | null;
};

export type ProspectAiActivityEvent = {
  id?: string;
  type?: string | null;
  label?: string | null;
  description?: string | null;
  createdAt?: string | null;
  channel?: string | null;
  status?: string | null;
};

export type ProspectAiActivityResponse = {
  searches?: ProspectAiActivitySearch[];
  events?: ProspectAiActivityEvent[];
  outreachEvents?: ProspectAiActivityEvent[];
  campaignEvents?: ProspectAiActivityEvent[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Request failed");
  return data as T;
}

/** Monthly Prospect Discoveries included by subscription plan (catalog / activation copy). */
export function prospectDiscoveriesForPlan(plan: string | null | undefined): number {
  const normalized = (plan || "").toLowerCase();
  if (normalized.includes("pro")) return 500;
  if (normalized.includes("starter")) return 100;
  return 100;
}

export function normalizeProspectAiPlanLabel(
  plan: string | null | undefined,
): "pro" | "starter" | "other" {
  const normalized = (plan || "").toLowerCase();
  if (normalized.includes("pro")) return "pro";
  if (normalized.includes("starter")) return "starter";
  return "other";
}

/** Compact two-line catalog quota block (both plans). */
export function prospectDiscoveriesCatalogLines(): { title: string; lines: string[] } {
  return {
    title: "Included with your plan",
    lines: [
      "Starter: 100 Prospect Discoveries / month",
      "Pro: 500 Prospect Discoveries / month",
    ],
  };
}

/** Activation / workspace: emphasize current plan when known. */
export function prospectDiscoveriesPlanPanel(plan: string | null | undefined): {
  title: string;
  primary: string;
  secondaryLines?: string[];
} {
  const label = normalizeProspectAiPlanLabel(plan);
  if (label === "pro") {
    return {
      title: "Included with your Pro plan",
      primary: "500 Prospect Discoveries / month",
    };
  }
  if (label === "starter") {
    return {
      title: "Included with your Starter plan",
      primary: "100 Prospect Discoveries / month",
      secondaryLines: ["Pro: 500 Prospect Discoveries / month"],
    };
  }
  const catalog = prospectDiscoveriesCatalogLines();
  return {
    title: catalog.title,
    primary: catalog.lines[0],
    secondaryLines: catalog.lines.slice(1),
  };
}

/** @deprecated Prefer prospectDiscoveriesCatalogLines / prospectDiscoveriesPlanPanel */
export function prospectDiscoveriesPlanCopy(plan: string | null | undefined): string {
  return prospectDiscoveriesPlanPanel(plan).primary;
}

/** @deprecated Prefer prospectDiscoveriesCatalogLines */
export function prospectDiscoveriesCatalogCopy(): string {
  return prospectDiscoveriesCatalogLines().lines.join(" · ");
}

export function useProspectAiStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PROSPECT_AI_STATUS_KEY,
    queryFn: () => fetchJson<ProspectAiStatus>("/api/growth-engines/prospect-ai/status"),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useActivateProspectAi() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      fetchJson<ProspectAiStatus>("/api/growth-engines/prospect-ai/activate", {
        method: "POST",
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(PROSPECT_AI_STATUS_KEY, data);
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_STATUS_KEY });
    },
  });
}

export function useProspectAiDiscover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { businessType: string; location: string; radiusKm?: number }) =>
      fetchJson<ProspectAiDiscoverResponse>("/api/growth-engines/prospect-ai/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(PROSPECT_AI_STATUS_KEY, (prev: ProspectAiStatus | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          monthlyQuota: data.quota.monthlyQuota,
          used: data.quota.used,
          remaining: data.quota.remaining,
        };
      });
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_ACTIVITY_KEY });
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_STATUS_KEY });
    },
  });
}

export function useSendDiscoverToReview(searchId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (resultIds: string[]) => {
      if (!searchId) throw new Error("No discovery search selected");
      return fetchJson<{
        sent?: number;
        analysisStarted?: boolean;
        analysisJobId?: string | null;
        contactIds?: string[];
      }>(`/api/growth-engines/prospect-ai/discover/${searchId}/send-to-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultIds }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/growth-tools/prospect-intelligence"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/growth-tools/prospect-intelligence/bulk-analyze/active"],
      });
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_ACTIVITY_KEY });
    },
  });
}

export function useProspectAiActivity(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PROSPECT_AI_ACTIVITY_KEY,
    queryFn: () => fetchJson<ProspectAiActivityResponse>("/api/growth-engines/prospect-ai/activity"),
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export type ProspectAiWonStats = {
  outreachSent: number;
  replied: number;
  qualified: number;
  won: number;
  replyRate: number | null;
  winRate: number | null;
  qualifiedToWon: number | null;
};

export type ProspectAiWonCustomer = {
  contactId: string;
  name: string;
  source: string | null;
  campaign: string | null;
  firstOutreachAt: string | null;
  wonAt: string | null;
  markedByUserId: string | null;
  markedByName: string | null;
  outcome: string;
};

export function useProspectAiWonStats(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: PROSPECT_AI_WON_STATS_KEY,
    queryFn: () => fetchJson<ProspectAiWonStats>("/api/growth-engines/prospect-ai/won/stats"),
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useProspectAiWonCustomers(
  filter: "this_month" | "last_30_days" | "all_time" = "all_time",
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["/api/growth-engines/prospect-ai/won/customers", filter],
    queryFn: () =>
      fetchJson<{ customers: ProspectAiWonCustomer[] }>(
        `/api/growth-engines/prospect-ai/won/customers?filter=${encodeURIComponent(filter)}`,
      ),
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
    retry: false,
  });
}

export function useMarkProspectAiWon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      fetchJson(`/api/growth-engines/prospect-ai/contacts/${contactId}/mark-won`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_WON_STATS_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["/api/growth-engines/prospect-ai/won/customers"],
      });
    },
  });
}

export function useSetProspectAiOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { contactId: string; outcome: string }) =>
      fetchJson(`/api/growth-engines/prospect-ai/contacts/${params.contactId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: params.outcome }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROSPECT_AI_WON_STATS_KEY });
      void queryClient.invalidateQueries({
        queryKey: ["/api/growth-engines/prospect-ai/won/customers"],
      });
    },
  });
}

export const AI_BRAIN_SOURCE_LABELS: {
  key: keyof Omit<ProspectAiBrainStatus, "configured">;
  label: string;
}[] = [
  { key: "businessProfile", label: "Business Profile" },
  { key: "businessKnowledge", label: "Business Knowledge" },
  { key: "websiteKnowledge", label: "Website Knowledge" },
];
