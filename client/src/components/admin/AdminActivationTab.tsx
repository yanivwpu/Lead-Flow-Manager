import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ActivationSummary = {
  topMetrics: {
    totalUsers: number;
    activeUsers: number;
    ghlInstalls: number;
    shopifyInstalls: number;
    websiteSignups: number;
    payingCustomers: number;
    paidSubscribers: number;
    proTrialUsers: number;
    websitePaidUsers: number;
    shopifyPaidUsers: number;
    marketplacePaidUsers: number;
    freeUsers: number;
    trialUsers: number;
  };
  channelMetrics: Record<string, number>;
  usageMetrics: Record<string, number>;
  funnel: { key: string; label: string; count: number; percent: number }[];
};

type ActivationAccount = {
  id: string;
  name: string;
  email: string;
  source: string;
  plan: string;
  billingPlan: string;
  subscriptionStatus: string;
  trialStatus: string;
  isPaying: boolean;
  isProTrial: boolean;
  paidBillingSource: string | null;
  whatsappConnected: boolean;
  facebookConnected: boolean;
  instagramConnected: boolean;
  conversationsCount: number;
  messagesSent: number;
  messagesReceived: number;
  aiUsed: boolean;
  automationsActive: boolean;
  rgeEnabled: boolean;
  agentPageEnabled: boolean;
  inventoryConnected: boolean;
  lastActivity: string | null;
  createdAt: string | null;
};

function getAdminToken() {
  return localStorage.getItem("whachat_admin_token") || "";
}

function adminFetch(url: string, options: RequestInit & { timeoutMs?: number } = {}) {
  const token = getAdminToken();
  const { timeoutMs = 30_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const extraHeaders = (fetchOptions.headers as Record<string, string> | undefined) ?? {};
  return fetch(url, {
    ...fetchOptions,
    signal: controller.signal,
    credentials: "include",
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
      ...extraHeaders,
    },
  }).finally(() => clearTimeout(timer));
}

type ActivationAccountsResponse = {
  accounts?: ActivationAccount[];
  rows?: ActivationAccount[];
  total: number;
  error?: string;
};

function SubMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}
function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function BoolBadge({ value }: { value: boolean }) {
  return value ? (
    <Badge className="bg-green-100 text-green-700">Yes</Badge>
  ) : (
    <Badge variant="secondary">No</Badge>
  );
}

export function AdminActivationTab({ enabled }: { enabled: boolean }) {
  const [source, setSource] = useState("all");
  const [plan, setPlan] = useState("all");
  const [channelConnected, setChannelConnected] = useState("all");
  const [hasConversations, setHasConversations] = useState("all");
  const [trial, setTrial] = useState("all");
  const [paying, setPaying] = useState("all");
  const [search, setSearch] = useState("");

  const { data: summary, isLoading: summaryLoading } = useQuery<ActivationSummary>({
    queryKey: ["/api/admin/activation/summary"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/activation/summary");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled,
  });

  const accountsQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (source !== "all") params.set("source", source);
    if (plan !== "all") params.set("plan", plan);
    if (channelConnected !== "all") params.set("channelConnected", channelConnected);
    if (hasConversations !== "all") params.set("hasConversations", hasConversations);
    if (trial !== "all") params.set("trial", trial);
    if (paying !== "all") params.set("paying", paying);
    if (search.trim()) params.set("search", search.trim());
    params.set("limit", "200");
    return `/api/admin/activation/accounts?${params.toString()}`;
  }, [source, plan, channelConnected, hasConversations, trial, paying, search]);

  const {
    data: accountsData,
    isLoading: accountsLoading,
    isError: accountsError,
    error: accountsErrorDetail,
    refetch: refetchAccounts,
    isFetching: accountsFetching,
  } = useQuery<ActivationAccountsResponse>({
    queryKey: [accountsQuery],
    queryFn: async () => {
      const res = await adminFetch(accountsQuery);
      const body = (await res.json().catch(() => ({}))) as ActivationAccountsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(body.error || `Failed to load accounts (${res.status})`);
      }
      if (body.error) {
        throw new Error(body.error);
      }
      return body;
    },
    enabled,
    retry: 1,
    staleTime: 30_000,
  });

  const accountRows = accountsData?.accounts ?? accountsData?.rows ?? [];

  if (summaryLoading) {
    return (
      <div className="flex justify-center py-16 text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!summary) return null;

  const { topMetrics, channelMetrics, usageMetrics, funnel } = summary;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-semibold text-gray-900">Activation overview</h2>
        <p className="text-sm text-gray-500">Product adoption across GHL, Shopify, website signups, and channels.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total users" value={topMetrics.totalUsers} />
        <MetricCard label="Active users" value={topMetrics.activeUsers} />
        <MetricCard label="Paid subscribers" value={topMetrics.paidSubscribers} />
        <MetricCard label="Pro trial users" value={topMetrics.proTrialUsers} />
        <MetricCard label="Website paid (Stripe)" value={topMetrics.websitePaidUsers} />
        <MetricCard label="Shopify paid" value={topMetrics.shopifyPaidUsers} />
        <MetricCard label="Marketplace paid (GHL)" value={topMetrics.marketplacePaidUsers} />
        <MetricCard label="GHL installs" value={topMetrics.ghlInstalls} />
        <MetricCard label="Shopify installs" value={topMetrics.shopifyInstalls} />
        <MetricCard label="Website signups" value={topMetrics.websiteSignups} />
        <MetricCard label="Free users" value={topMetrics.freeUsers} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Channel connections</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(channelMetrics).map(([key, value]) => (
              <SubMetric
                key={key}
                label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                value={value}
              />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Usage</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(usageMetrics).map(([key, value]) => (
              <SubMetric
                key={key}
                label={key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                value={value}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Activation funnel</h3>
        <div className="space-y-3">
          {funnel.map((step, idx) => (
            <div key={step.key} className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-brand-green">
                {idx + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-gray-900">{step.label}</span>
                  <span className="text-gray-600">
                    {step.count.toLocaleString()} ({step.percent}%)
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-green transition-all"
                    style={{ width: `${Math.min(step.percent, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Account activation</h3>
            <p className="text-sm text-gray-500">
              {accountsLoading || accountsFetching
                ? "Loading accounts..."
                : accountsError
                  ? "Could not load accounts"
                  : `${accountsData?.total ?? accountRows.length} account(s)`}
            </p>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email"
            className="max-w-xs"
          />
        </div>

        {accountsError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="font-medium">Failed to load account activation data</p>
            <p className="mt-1 text-red-700">
              {accountsErrorDetail instanceof Error
                ? accountsErrorDetail.message
                : "Unknown error"}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-medium text-red-900 underline"
              onClick={() => void refetchAccounts()}
            >
              Retry
            </button>
          </div>
        ) : null}

        <div className="mb-4 flex flex-wrap gap-2">
          {[
            { label: "Source", value: source, set: setSource, options: ["all", "GHL", "Shopify", "Website", "Partner"] },
            { label: "Plan", value: plan, set: setPlan, options: ["all", "free", "starter", "pro"] },
            { label: "Channel", value: channelConnected, set: setChannelConnected, options: ["all", "yes", "no"] },
            { label: "Conversations", value: hasConversations, set: setHasConversations, options: ["all", "yes", "no"] },
            { label: "Trial", value: trial, set: setTrial, options: ["all", "yes", "no"] },
            { label: "Paying", value: paying, set: setPaying, options: ["all", "yes", "no"] },
          ].map((filter) => (
            <div key={filter.label} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">{filter.label}</span>
              <select
                value={filter.value}
                onChange={(e) => filter.set(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                {filter.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Paying</TableHead>
                <TableHead>WA</TableHead>
                <TableHead>FB</TableHead>
                <TableHead>IG</TableHead>
                <TableHead>Conv.</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead>Recv.</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Auto</TableHead>
                <TableHead>RGE</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Inventory</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountsLoading && accountRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="py-8 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-gray-400" />
                  </TableCell>
                </TableRow>
              ) : accountsError ? (
                <TableRow>
                  <TableCell colSpan={20} className="py-8 text-center text-sm text-gray-500">
                    No accounts loaded. Use Retry above or check server logs.
                  </TableCell>
                </TableRow>
              ) : accountRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={20} className="py-8 text-center text-sm text-gray-500">
                    No accounts match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                accountRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium text-gray-900">{row.name}</div>
                      <div className="text-xs text-gray-500">{row.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{row.source}</TableCell>
                    <TableCell className="text-sm capitalize">{row.plan}</TableCell>
                    <TableCell className="text-sm capitalize">{row.billingPlan}</TableCell>
                    <TableCell className="text-sm">{row.subscriptionStatus}</TableCell>
                    <TableCell className="text-sm">
                      {row.isProTrial ? (
                        <Badge className="bg-amber-100 text-amber-800">Pro trial</Badge>
                      ) : (
                        row.trialStatus
                      )}
                    </TableCell>
                    <TableCell>
                      <BoolBadge value={row.isPaying} />
                      {row.paidBillingSource ? (
                        <div className="mt-0.5 text-[10px] text-gray-500">{row.paidBillingSource}</div>
                      ) : null}
                    </TableCell>
                    <TableCell><BoolBadge value={row.whatsappConnected} /></TableCell>
                    <TableCell><BoolBadge value={row.facebookConnected} /></TableCell>
                    <TableCell><BoolBadge value={row.instagramConnected} /></TableCell>
                    <TableCell className="text-sm">{row.conversationsCount}</TableCell>
                    <TableCell className="text-sm">{row.messagesSent}</TableCell>
                    <TableCell className="text-sm">{row.messagesReceived}</TableCell>
                    <TableCell><BoolBadge value={row.aiUsed} /></TableCell>
                    <TableCell><BoolBadge value={row.automationsActive} /></TableCell>
                    <TableCell><BoolBadge value={row.rgeEnabled} /></TableCell>
                    <TableCell><BoolBadge value={row.agentPageEnabled} /></TableCell>
                    <TableCell><BoolBadge value={row.inventoryConnected} /></TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {row.lastActivity ? new Date(row.lastActivity).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
