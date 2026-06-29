import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type GhlInstallRow = {
  id: string;
  source: string;
  agency: string;
  agencyOwner: string;
  agencyEmail: string;
  subAccountName: string;
  locationId: string;
  companyId: string;
  installDate: string | null;
  installationStatus: string;
  uninstallDate: string | null;
  pricePlan: string;
  billingStatus: string;
  lastSyncDate: string | null;
  tokenExpiresAt: string | null;
  whachatUserName: string;
  whachatUserEmail: string;
  isActive: boolean;
};

function getAdminToken() {
  return localStorage.getItem("whachat_admin_token") || "";
}

function adminFetch(url: string, options: RequestInit = {}) {
  const token = getAdminToken();
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(token ? { "x-admin-token": token } : {}),
      ...(options.headers as Record<string, string>),
    },
  });
}

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Unknown" : d.toLocaleDateString();
}

export function AdminGhlTab({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvPaste, setCsvPaste] = useState("");

  const { data: installations = [], isLoading } = useQuery<GhlInstallRow[]>({
    queryKey: ["/api/admin/ghl/installations"],
    queryFn: async () => {
      const res = await adminFetch("/api/admin/ghl/installations");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled,
  });

  const importCsv = useMutation({
    mutationFn: async (csv: string) => {
      const res = await adminFetch("/api/admin/ghl/import-installs-csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      return data as { imported: number; errors: string[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ghl/installations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ghl-integrations"] });
      toast({
        title: "GHL installs imported",
        description: `${data.imported} row(s) upserted${data.errors.length ? ` · ${data.errors.length} error(s)` : ""}`,
      });
      setCsvPaste("");
    },
    onError: (err: Error) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFile = async (file: File) => {
    const text = await file.text();
    importCsv.mutate(text);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-gray-900">LeadConnector / GHL Marketplace</h2>
          <p className="text-sm text-gray-500">
            OAuth integrations, marketplace webhooks, and CSV imports — merged by Location ID + Company ID.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Import CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/ghl/installations"] })}
          >
            Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Paste marketplace export CSV</p>
        <Textarea
          value={csvPaste}
          onChange={(e) => setCsvPaste(e.target.value)}
          placeholder="Agency, Company ID, Sub-account, Location ID, ..."
          rows={3}
          className="bg-white text-sm"
        />
        <Button
          type="button"
          size="sm"
          className="mt-2"
          disabled={!csvPaste.trim() || importCsv.isPending}
          onClick={() => importCsv.mutate(csvPaste)}
        >
          {importCsv.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Upsert from paste
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agency</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Agency email</TableHead>
                <TableHead>Sub-account</TableHead>
                <TableHead>Location ID</TableHead>
                <TableHead>Company ID</TableHead>
                <TableHead>Install date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Uninstall</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Last sync</TableHead>
                <TableHead>Token expires</TableHead>
                <TableHead>Whachat user</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={15} className="py-8 text-center text-gray-500">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : installations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={15} className="py-8 text-center text-gray-500">
                    No GHL marketplace installs found. Import a CSV from GHL Marketplace or complete an OAuth install.
                  </TableCell>
                </TableRow>
              ) : (
                installations.map((row) => (
                  <TableRow key={row.id} data-testid={`row-ghl-${row.id}`}>
                    <TableCell className="text-sm">{row.agency}</TableCell>
                    <TableCell className="text-sm">{row.agencyOwner}</TableCell>
                    <TableCell className="text-sm">{row.agencyEmail}</TableCell>
                    <TableCell className="text-sm">{row.subAccountName}</TableCell>
                    <TableCell>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{row.locationId}</code>
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">{row.companyId}</code>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(row.installDate)}</TableCell>
                    <TableCell>
                      {row.isActive ? (
                        <Badge className="bg-green-100 text-green-700">{row.installationStatus}</Badge>
                      ) : (
                        <Badge variant="secondary">{row.installationStatus}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(row.uninstallDate)}</TableCell>
                    <TableCell className="text-sm capitalize">{row.pricePlan}</TableCell>
                    <TableCell className="text-sm">{row.billingStatus}</TableCell>
                    <TableCell className="text-sm">{formatDate(row.lastSyncDate)}</TableCell>
                    <TableCell className="text-sm">
                      {row.tokenExpiresAt ? (
                        <span
                          className={
                            new Date(row.tokenExpiresAt) < new Date() ? "font-medium text-red-600" : ""
                          }
                        >
                          {formatDate(row.tokenExpiresAt)}
                        </span>
                      ) : (
                        "Unknown"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="font-medium">{row.whachatUserName}</div>
                      <div className="text-xs text-gray-500">{row.whachatUserEmail}</div>
                    </TableCell>
                    <TableCell className="text-xs capitalize text-gray-500">{row.source}</TableCell>
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
