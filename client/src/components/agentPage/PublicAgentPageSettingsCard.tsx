import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
import { buildAgentPageUrl, validateAgentPageSlugInput } from "@shared/agent/agentPageSlug";
import { fetchAgentPageSettings, parseAgentPageApiError } from "@/lib/agentPageApi";
import { AgentPageMarketAreaChips } from "@/components/agentPage/AgentPageMarketAreaChips";

const BUSINESS_PROFILE_SETTINGS_PATH = "/app/settings";

type Props = {
  className?: string;
};

function resolveDisplayAgentUrl(
  slug: string | null,
  publicPageUrl: string | null,
  enabled: boolean,
): string | null {
  if (!enabled || !slug) return null;
  if (publicPageUrl) return publicPageUrl;
  if (typeof window !== "undefined") {
    return buildAgentPageUrl(slug, window.location.origin);
  }
  return null;
}

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

  const pageIsPublic = Boolean(
    data?.publishListingsPublicly && data?.agentPageEnabled && data?.agentPageSlug,
  );

  const agentDisplayUrl = useMemo(
    () =>
        resolveDisplayAgentUrl(
          data?.agentPageSlug ?? (slugDraft || null),
        data?.publicPageUrl ?? null,
        Boolean(data?.agentPageEnabled),
      ),
    [data?.agentPageSlug, data?.publicPageUrl, data?.agentPageEnabled, slugDraft],
  );

  if (isLoading || !data) {
    return (
      <div
        className={cn("rounded-xl border border-gray-200 bg-white px-4 py-8", className)}
        data-testid="public-agent-page-settings"
      >
        <div className="flex justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          Loading agent page…
        </div>
      </div>
    );
  }

  const publishStatusLabel = !data.agentPageEnabled
    ? "Page disabled"
    : !data.publishListingsPublicly
      ? "Workspace publishing off"
      : !data.agentPageSlug
        ? "Slug required"
        : pageIsPublic
          ? "Live"
          : "Not public yet";

  const publishStatusClass = pageIsPublic
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : data.agentPageEnabled
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <section
      className={cn("rounded-xl border border-gray-200 bg-white", className)}
      data-testid="public-agent-page-settings"
    >
      <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-gray-100 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-green shrink-0" />
              Public Agent Page
            </h2>
            <p className="text-sm text-muted-foreground">
              Create a public profile page to capture seller and buyer leads.
            </p>
          </div>
          <div
            className={cn(
              "inline-flex items-center gap-2 text-sm font-medium shrink-0",
              data.agentPageEnabled ? "text-emerald-700" : "text-gray-500",
            )}
            data-testid="agent-page-active-status"
          >
            {data.agentPageEnabled ? (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            ) : (
              <Circle className="h-4 w-4" aria-hidden />
            )}
            {data.agentPageEnabled ? "Agent Page Active" : "Agent Page Disabled"}
          </div>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
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

            <div className="space-y-2" data-testid="agent-page-url-block">
              <Label htmlFor="agent-page-slug">Agent URL</Label>
              {data.agentPageEnabled && (slugDraft || data.agentPageSlug) && agentDisplayUrl ? (
                <div className="rounded-md border border-gray-200 bg-gray-50/80 px-3 py-2.5 space-y-2">
                  <p className="text-sm text-gray-900 break-all font-mono">{agentDisplayUrl}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(agentDisplayUrl);
                        toast({ title: "Link copied" });
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={agentDisplayUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enable the page and set a slug to get your public URL.
                </p>
              )}
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
                  Suggest slug
                </Button>
              </div>
              {slugError ? (
                <p className="text-xs text-destructive" role="alert">
                  {slugError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">URL path: /agents/your-slug</p>
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

            <div className="space-y-2 pt-1" data-testid="agent-page-publish-status">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">Page visibility</p>
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
                  Turn on &quot;Publish listings publicly&quot; in Business Profile for a live public page.
                </p>
              )}
              {data.publishListingsPublicly && data.agentPageEnabled && !data.agentPageSlug && (
                <p className="text-xs text-amber-700 leading-snug">Add a slug to publish your agent page.</p>
              )}
            </div>
          </div>

          <div className="space-y-4 min-w-0" data-testid="agent-page-profile-column">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Managed in Business Profile
                </p>
                <Button asChild variant="outline" size="sm" className="h-8 w-fit">
                  <Link href={BUSINESS_PROFILE_SETTINGS_PATH}>Edit Business Profile</Link>
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Display name</p>
                <p className="text-sm font-medium text-gray-900" data-testid="agent-page-inherited-name">
                  {data.businessProfileDisplayName}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Default about</p>
                <p
                  className="text-sm text-gray-700 whitespace-pre-wrap"
                  data-testid="agent-page-inherited-about"
                >
                  {data.businessProfileAbout || "—"}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100">
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
              <AgentPageMarketAreaChips
                value={data.agentPageMarketArea}
                disabled={saveMutation.isPending}
                onSave={(serialized) => {
                  if (serialized !== (data.agentPageMarketArea || null)) {
                    saveMutation.mutate({ agentPageMarketArea: serialized });
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div
          className="mt-6 pt-4 border-t border-dashed border-gray-200"
          data-testid="agent-page-future-analytics"
        >
          <p className="text-xs font-medium text-gray-500 mb-3">Coming soon</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {["Lead capture analytics", "Page views", "QR code", "Share links"].map((label) => (
              <div
                key={label}
                className="rounded-md border border-dashed border-gray-200 bg-gray-50/50 px-3 py-4 text-center text-xs text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
