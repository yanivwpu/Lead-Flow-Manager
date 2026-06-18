import { useCallback, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";
import type { AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";
import { validateAgentPageSlugInput } from "@shared/agent/agentPageSlug";

async function fetchAgentPageSettings(): Promise<AgentPageSettingsResponse> {
  const res = await fetch("/api/agent-page", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(parseAgentPageApiError(body));
  }
  return res.json();
}

function parseAgentPageApiError(body: unknown): string {
  if (!body || typeof body !== "object") return "Request failed";
  const record = body as { error?: unknown; message?: unknown };
  if (typeof record.error === "string" && record.error.trim()) return record.error;
  if (typeof record.message === "string" && record.message.trim()) return record.message;
  if (record.error && typeof record.error === "object") {
    const flat = record.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const parts = [
      ...(flat.formErrors ?? []),
      ...Object.values(flat.fieldErrors ?? {}).flat(),
    ].filter(Boolean);
    if (parts.length > 0) return parts.join("; ");
  }
  return "Request failed";
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

  const [slugDraft, setSlugDraft] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [customBioDraft, setCustomBioDraft] = useState("");

  useEffect(() => {
    if (!data) return;
    setSlugDraft(data.agentPageSlug || "");
    setSlugError(null);
    setCustomBioDraft(data.agentPageBio || "");
  }, [data?.agentPageSlug, data?.agentPageBio, data?.agentPageUseCustomBio]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/agent-page", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(parseAgentPageApiError(payload));
      }
      return payload as AgentPageSettingsResponse;
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
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(parseAgentPageApiError(payload));
      return payload as { slug: string | null };
    },
  });

  const saveSlug = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed === (data?.agentPageSlug || "")) {
        setSlugError(null);
        return;
      }
      if (!trimmed) {
        setSlugError(null);
        saveMutation.mutate({ agentPageSlug: null });
        return;
      }
      const validated = validateAgentPageSlugInput(trimmed);
      if (!validated.ok) {
        setSlugError(validated.error);
        return;
      }
      setSlugError(null);
      saveMutation.mutate({ agentPageSlug: validated.slug });
    },
    [data?.agentPageSlug, saveMutation],
  );

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

  const pageUrl = data.publicPageUrl;
  const pageIsPublic = Boolean(data.publishListingsPublicly && data.agentPageEnabled && data.agentPageSlug);

  return (
    <Card className={cn(className, "pb-safe")} data-testid="public-agent-page-settings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-brand-green" />
          Public Agent Page
        </CardTitle>
        <CardDescription>
          Marketing page with your published MLS listings and lead capture.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pb-24 sm:pb-6">
        {!data.publishListingsPublicly && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Workspace publishing is off — you can still configure your agent page, but it will not be
            public until you enable &quot;Publish listings publicly&quot; in Business Profile.
          </p>
        )}
        {data.publishListingsPublicly && data.agentPageEnabled && !data.agentPageSlug && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Add an agent slug to get your public URL.
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="agent-page-enabled" className="text-sm font-medium">
            Enable page
          </Label>
          <Switch
            id="agent-page-enabled"
            checked={data.agentPageEnabled}
            disabled={saveMutation.isPending}
            onCheckedChange={(checked) => saveMutation.mutate({ agentPageEnabled: checked })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="agent-page-slug">Agent slug</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              id="agent-page-slug"
              value={slugDraft}
              placeholder="jane-smith-a1b2c3d4"
              aria-invalid={slugError ? true : undefined}
              className={cn(slugError && "border-destructive focus-visible:ring-destructive")}
              onChange={(e) => {
                setSlugDraft(e.target.value);
                if (slugError) setSlugError(null);
              }}
              onBlur={() => saveSlug(slugDraft)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={suggestSlugMutation.isPending || saveMutation.isPending}
              onClick={async () => {
                try {
                  const result = await suggestSlugMutation.mutateAsync();
                  if (result.slug) {
                    setSlugDraft(result.slug);
                    setSlugError(null);
                    saveMutation.mutate({ agentPageSlug: result.slug });
                  }
                } catch (e) {
                  toast({
                    title: "Could not generate slug",
                    description: e instanceof Error ? e.message : undefined,
                    variant: "destructive",
                  });
                }
              }}
            >
              Suggest
            </Button>
          </div>
          {slugError ? (
            <p className="text-xs text-destructive" role="alert">
              {slugError}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">/agents/your-slug</p>
          )}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2.5 space-y-2">
          <p className="text-[10px] uppercase tracking-wide font-medium text-slate-500">
            From Business Profile
          </p>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Display name</p>
            <p className="text-sm font-medium text-slate-900" data-testid="agent-page-inherited-name">
              {data.businessProfileDisplayName}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">About</p>
            <p
              className="text-sm text-slate-700 whitespace-pre-wrap"
              data-testid="agent-page-inherited-about"
            >
              {data.businessProfileAbout || "—"}
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Edit name, contact, and about in Business Profile settings.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="agent-page-custom-bio" className="text-sm font-medium">
            Use custom Agent Page bio
          </Label>
          <Switch
            id="agent-page-custom-bio"
            checked={data.agentPageUseCustomBio}
            disabled={saveMutation.isPending}
            onCheckedChange={(checked) => {
              if (!checked) {
                saveMutation.mutate({ agentPageUseCustomBio: false, agentPageBio: null });
                return;
              }
              saveMutation.mutate({
                agentPageUseCustomBio: true,
                agentPageBio: customBioDraft.trim() || data.businessProfileAbout || "",
              });
            }}
          />
        </div>

        {data.agentPageUseCustomBio && (
          <div className="space-y-2">
            <Label htmlFor="agent-page-bio">Custom bio</Label>
            <Textarea
              id="agent-page-bio"
              rows={3}
              value={customBioDraft}
              placeholder="Optional override for your public agent page…"
              onChange={(e) => setCustomBioDraft(e.target.value)}
              onBlur={() => {
                const v = customBioDraft.trim();
                if (v !== (data.agentPageBio || "")) {
                  saveMutation.mutate({ agentPageUseCustomBio: true, agentPageBio: v || null });
                }
              }}
            />
          </div>
        )}

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
          {pageUrl && pageIsPublic ? (
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
            <p className="text-xs text-muted-foreground">
              {data.agentPageEnabled
                ? "Public URL appears when workspace publishing is on and slug is saved."
                : "Enable the page and save a slug to get your public URL."}
            </p>
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
