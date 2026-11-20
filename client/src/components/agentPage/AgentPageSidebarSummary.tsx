import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchAgentPageSettings } from "@/lib/agentPageApi";

export function AgentPageSidebarSummary() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/agent-page"],
    queryFn: fetchAgentPageSettings,
  });

  const pageIsPublic = Boolean(data?.publicPageUrl);

  const statusLabel = !data?.agentPageEnabled
    ? "Offline"
    : pageIsPublic
      ? "Live"
      : "Setup";

  const statusClass = pageIsPublic
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : data?.agentPageEnabled
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <Card data-testid="agent-page-sidebar-summary">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-brand-green" />
          Agent Page
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 text-sm">
        {isError ? <p role="alert" className="text-slate-700">Status unavailable</p> : isLoading ? (
          <div className="flex items-center text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Loading…
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a href="#agent-page-settings" className="font-medium text-slate-700 underline-offset-4 hover:underline">Manage page</a>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", statusClass)}>{statusLabel}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
