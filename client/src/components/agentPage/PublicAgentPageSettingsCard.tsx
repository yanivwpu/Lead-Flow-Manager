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
  const [customBioError, setCustomBioError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setSlugDraft(data.agentPageSlug || "");
    setSlugError(null);
    setCustomBioDraft(data.agentPageBio || "");
    setCustomBioError(null);
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

  const publishStatusLabel = !data.agentPageEnabled
    ? "Page disabled"
    : !data.publishListingsPublicly
      ? "Workspace publishing off"
      : !data.agentPageSlug
        ? "Slug required"
        : pageIsPublic
          ? "Live"
          : "Not public";

  const publishStatusClass = pageIsPublic
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : data.agentPageEnabled
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <Card className={cn(className)} data-testid="public-agent-page-settings">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Globe className="w-4 h-4 text-brand-green" />
          Public Agent Page
        </CardTitle>
        <CardDescription>
          Marketing page with your published MLS listings and lead capture. Display name and default
          about text come from Business Profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
          {/* Left: page controls */}
          <div className="space-y-4 min-w-0" data-testid="agent-page-controls-column">
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

            <div className="rounded-md border px-3 py-2.5 space-y-2" data-testid="agent-page-publish-status">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-700">Publish status</p>
                <span
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                    publishStatusClass,
                  )}
                >
                  {publishStatusLabel}
                </span>
              </div>
              {!data.publishListingsPublicly && (
                <p className="text-xs text-amber-700 leading-snug">
                  Enable &quot;Publish listings publicly&quot; in Business Profile for a live public URL.
                </p>
              )}
              {data.publishListingsPublicly && data.agentPageEnabled && !data.agentPageSlug && (
                <p className="text-xs text-amber-700 leading-snug">
                  Add an agent slug to get your public URL.
                </p>
              )}
              {pageUrl && pageIsPublic ? (
                <div className="space-y-2 pt-1">
                  <p className="text-xs text-muted-foreground break-all">{pageUrl}</p>
                  <div className="flex flex-wrap gap-2">
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
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground leading-snug">
                  {data.agentPageEnabled
                    ? "Public URL appears when workspace publishing is on and slug is saved."
                    : "Enable the page and save a slug to get your public URL."}
                </p>
              )}
            </div>
          </div>

          {/* Right: profile content */}
          <div className="space-y-4 min-w-0" data-testid="agent-page-profile-column">
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
                checked={data.agentPageUseCustomBio ?? false}
                disabled={saveMutation.isPending}
                onCheckedChange={(checked) => {
                  if (!checked) {
                    setCustomBioError(null);
                    saveMutation.mutate({ agentPageUseCustomBio: false, agentPageBio: null });
                    return;
                  }
                  const seed = customBioDraft.trim() || data.businessProfileAbout?.trim() || "";
                  if (!seed) {
                    setCustomBioError(
                      "Add an about blurb in Business Profile or enter a custom bio below.",
                    );
                    return;
                  }
                  setCustomBioError(null);
                  setCustomBioDraft(seed);
                  saveMutation.mutate({
                    agentPageUseCustomBio: true,
                    agentPageBio: seed,
                  });
                }}
              />
            </div>

            {customBioError ? (
              <p className="text-xs text-destructive" role="alert">
                {customBioError}
              </p>
            ) : null}

            {data.agentPageUseCustomBio && (
              <div className="space-y-2">
                <Label htmlFor="agent-page-bio">Custom bio</Label>
                <Textarea
                  id="agent-page-bio"
                  rows={4}
                  value={customBioDraft}
                  placeholder="Optional override for your public agent page…"
                  onChange={(e) => {
                    setCustomBioDraft(e.target.value);
                    if (customBioError) setCustomBioError(null);
                  }}
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
              <Label htmlFor="agent-page-market">Market / service area</Label>
              <Input
                id="agent-page-market"
                defaultValue={data.agentPageMarketArea || ""}
                placeholder="e.g. Tampa Bay, FL"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (data.agentPageMarketArea || "")) {
                    saveMutation.mutate({ agentPageMarketArea: v || null });
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="text-xs text-muted-foreground grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t">
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
