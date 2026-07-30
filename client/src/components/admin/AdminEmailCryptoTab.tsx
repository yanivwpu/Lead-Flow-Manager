/**
 * Sales Admin–only Gmail crypto key consistency viewer.
 * Uses the same adminFetch / x-admin-token pattern as other admin tabs.
 */
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

const ADMIN_TOKEN_KEY = "whachat_admin_token";

function adminFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY) || "";
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

export type EmailCryptoDiagResponse = {
  nodeEnv: string | null;
  keySource: string | null;
  keyFp8: string | null;
  productionFailClosed: boolean;
  emailEncryptionKeyPresent: boolean;
  processId: string;
  instanceId: string;
  mailboxId: string | null;
  email: string | null;
  accessTokenDecryptable: boolean;
  refreshTokenDecryptable: boolean;
  decryptFailureField: "access_token" | "refresh_token" | null;
};

export function AdminEmailCryptoTab() {
  const query = useQuery({
    queryKey: ["/api/admin/diagnostics/email-crypto"],
    queryFn: async (): Promise<EmailCryptoDiagResponse> => {
      const res = await adminFetch("/api/admin/diagnostics/email-crypto");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || `Request failed (${res.status})`,
        );
      }
      return data as EmailCryptoDiagResponse;
    },
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4" data-testid="admin-email-crypto-tab">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Gmail encryption diagnostics</h2>
            <p className="mt-1 text-sm text-gray-500">
              Read-only key fingerprint + decrypt probe. Call multiple times to compare{" "}
              <code className="text-xs">instanceId</code> / <code className="text-xs">keyFp8</code>{" "}
              across Railway replicas. Requires Sales Admin login (not the CRM owner session).
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            data-testid="admin-email-crypto-refresh"
          >
            {query.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Probe again
          </Button>
        </div>

        {query.isError ? (
          <p className="mt-4 text-sm text-red-600" data-testid="admin-email-crypto-error">
            {(query.error as Error).message}
          </p>
        ) : null}

        {query.data ? (
          <pre
            className="mt-4 overflow-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-800"
            data-testid="admin-email-crypto-json"
          >
            {JSON.stringify(query.data, null, 2)}
          </pre>
        ) : query.isLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : null}

        <p className="mt-3 text-xs text-gray-400">
          API: <code>/api/admin/diagnostics/email-crypto</code>
        </p>
      </div>
    </div>
  );
}
