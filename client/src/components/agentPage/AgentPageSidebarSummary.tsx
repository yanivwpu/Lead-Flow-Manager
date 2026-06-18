import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchAgentPageSettings } from "@/lib/agentPageApi";

export function AgentPageSidebarSummary() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/agent-page"],
    queryFn: fetchAgentPageSettings,
  });

  const pageIsPublic = Boolean(
    data?.publishListingsPublicly && data?.agentPageEnabled && data?.agentPageSlug,
  );

  const statusLabel = !data?.agentPageEnabled
    ? "Off"
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
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-brand-green" />
          Agent Page
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isLoading || !data ? (
          <div className="flex items-center text-muted-foreground text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground text-xs">Status</span>
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                  statusClass,
                )}
              >
                {statusLabel}
              </span>
            </div>
            {data.agentPageSlug ? (
              <p className="text-xs text-gray-700 truncate font-mono" title={data.agentPageSlug}>
                /agents/{data.agentPageSlug}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 pt-1">
              {pageIsPublic && data.publicPageUrl ? (
                <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
                  <a href={data.publicPageUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3 w-3 mr-1.5" />
                    Open public page
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm" className="h-8 w-full text-xs">
                <a href="#agent-page-settings">Open agent page settings</a>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
