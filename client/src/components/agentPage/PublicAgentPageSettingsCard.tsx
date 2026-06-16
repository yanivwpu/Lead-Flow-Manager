import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";

async function fetchAgentPageSettings(): Promise<AgentPageSettingsResponse> {
  const res = await fetch("/api/agent-page", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load agent page settings");
  return res.json();
}

type Props = {
  className?: string;
};

export function PublicAgentPageSettingsCard({ className }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["/api/agent-page"],
    queryFn: fetchAgentPageSettings,
  });

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/agent-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Save failed");
      }
      return res.json() as Promise<AgentPageSettingsResponse>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/agent-page"] });
      toast({ title: "Agent page settings saved" });
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const suggestSlugMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/agent-page/suggest-slug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName: data?.agentPageDisplayName || data?.resolvedDisplayName }),
      });
      if (!res.ok) throw new Error("Could not suggest slug");
      return res.json() as Promise<{ slug: string | null }>;
    },
  });

  if (isLoading || !data) {
    return (
      <Card className={className} data-testid="public-agent-page-settings">
        <CardContent className="py-8 flex justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading agent page…
        </CardContent>
      </Card>
    );
  }

  const canEnable = data.publishListingsPublicly;
  const pageUrl = data.publicPageUrl;

  return (
    <Card className={className} data-testid="public-agent-page-settings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-brand-green" />
          Public Agent Page
        </CardTitle>
        <CardDescription>
          Marketing page with your published MLS listings and lead capture.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEnable && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Enable &quot;Publish listings publicly&quot; in Business Profile before turning on your agent page.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="agent-page-enabled" className="text-sm font-medium">
            Enable page
          </Label>
          <Switch
            id="agent-page-enabled"
            checked={data.agentPageEnabled}
            disabled={!canEnable || saveMutation.isPending}
            onCheckedChange={(checked) => saveMutation.mutate({ agentPageEnabled: checked })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-page-slug">Agent slug</Label>
          <div className="flex gap-2">
            <Input
              id="agent-page-slug"
              defaultValue={data.agentPageSlug || ""}
              placeholder="jane-smith-a1b2c3d4"
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== (data.agentPageSlug || "")) saveMutation.mutate({ agentPageSlug: v || null });
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={suggestSlugMutation.isPending}
              onClick={async () => {
                try {
                  const result = await suggestSlugMutation.mutateAsync();
                  if (result.slug) saveMutation.mutate({ agentPageSlug: result.slug });
                } catch {
                  toast({ title: "Could not generate slug", variant: "destructive" });
                }
              }}
            >
              Suggest
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">/agents/your-slug</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-page-display-name">Display name</Label>
          <Input
            id="agent-page-display-name"
            defaultValue={data.agentPageDisplayName || data.resolvedDisplayName}
            placeholder={data.resolvedDisplayName}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (data.agentPageDisplayName || data.resolvedDisplayName)) {
                saveMutation.mutate({ agentPageDisplayName: v || null });
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-page-bio">Bio</Label>
          <Textarea
            id="agent-page-bio"
            rows={3}
            defaultValue={data.agentPageBio || data.resolvedBio}
            placeholder={data.resolvedBio || "Tell visitors about your experience…"}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (data.agentPageBio || data.resolvedBio)) {
                saveMutation.mutate({ agentPageBio: v || null });
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-page-market">Market area</Label>
          <Input
            id="agent-page-market"
            defaultValue={data.agentPageMarketArea || ""}
            placeholder="e.g. Tampa Bay, FL"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v !== (data.agentPageMarketArea || "")) saveMutation.mutate({ agentPageMarketArea: v || null });
            }}
          />
        </div>

        <div className="space-y-2">
          <Label>Preferred lead capture</Label>
          <Select
            value={data.agentPagePreferredLeadCapture}
            onValueChange={(v) => saveMutation.mutate({ agentPagePreferredLeadCapture: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="webchat">Web chat widget</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="phone">Phone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="agent-page-home-worth" className="text-sm font-medium">
            Show Home Value CTA
          </Label>
          <Switch
            id="agent-page-home-worth"
            checked={data.agentPageShowHomeValueCta}
            disabled={saveMutation.isPending}
            onCheckedChange={(checked) => saveMutation.mutate({ agentPageShowHomeValueCta: checked })}
          />
        </div>

        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {pageUrl ? (
            <>
              <Button asChild variant="outline" size="sm">
                <a href={pageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open Page
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(pageUrl);
                  toast({ title: "Link copied" });
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy Link
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Save slug and enable page to get your public URL.</p>
          )}
        </div>

        <div className="text-xs text-muted-foreground grid grid-cols-2 gap-1 pt-1">
          <span>Views: {data.analytics.pageViews}</span>
          <span>Listing views: {data.analytics.listingViews}</span>
          <span>Ask About: {data.analytics.askAboutClicks}</span>
          <span>Showings: {data.analytics.scheduleShowingClicks}</span>
          <span>Home Value: {data.analytics.homeValueClicks}</span>
        </div>
      </CardContent>
    </Card>
  );
}
