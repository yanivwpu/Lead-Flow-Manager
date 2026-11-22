import { NeighborhoodPageSettings } from "./NeighborhoodPageSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
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
import type { AgentPageLeadCapture, AgentPageSettingsResponse } from "@shared/agent/agentPageSchema";
import { agentPageLeadCaptureSchema } from "@shared/agent/agentPageSchema";
import { validateAgentPageSlugInput } from "@shared/agent/agentPageSlug";
import { buildAgentPageEmbedIframeHtml } from "@shared/agent/agentPageEmbed";
import { fetchAgentPageSettings, parseAgentPageApiError } from "@/lib/agentPageApi";
import { bulkPublishEligibleListings } from "@/lib/inventoryApi";
import { logRgeSelect } from "@/lib/rgeSelectDebug";
import { AgentPageMarketAreaChips } from "@/components/agentPage/AgentPageMarketAreaChips";

const BUSINESS_PROFILE_SETTINGS_PATH = "/app/settings";
const DEFAULT_LEAD_CAPTURE: AgentPageLeadCapture = "webchat";

function AgentPageEmbedCodeBlock({ slug, appOrigin }: { slug: string; appOrigin: string }) {
  const saleSnippet = buildAgentPageEmbedIframeHtml({
    slug,
    appOrigin,
    listingType: "for_sale",
    title: "Homes for Sale",
  });
  const rentSnippet = buildAgentPageEmbedIframeHtml({
    slug,
    appOrigin,
    listingType: "for_rent",
    title: "Long-Term Rentals",
  });

  const copySnippet = async (label: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: `${label} embed code copied` });
    } catch {
      toast({ title: "Could not copy embed code", description: "Check clipboard permissions and try again.", variant: "destructive" });
    }
  };

  return (
    <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-embed-code">
      <summary className="cursor-pointer select-none text-sm font-medium text-gray-800">
        Embed listings on another website
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground leading-snug">
          Add your listings to a brokerage or personal website. Click to copy the embed code, then paste it into your website builder.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copySnippet("Homes for sale", saleSnippet)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy homes for sale embed
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copySnippet("Rentals", rentSnippet)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            Copy rentals embed
          </Button>
        </div>
      </div>
    </details>
  );
}

function normalizeLeadCapture(value: unknown): AgentPageLeadCapture {
  const parsed = agentPageLeadCaptureSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LEAD_CAPTURE;
}

type Props = {
  className?: string;
};

export function PublicAgentPageSettingsCard({ className }: Props) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/agent-page"],
    queryFn: fetchAgentPageSettings,
  });

  const [slugDraft, setSlugDraft] = useState("");
  const [slugError, setSlugError] = useState<string | null>(null);
  const [customBioDraft, setCustomBioDraft] = useState("");
  const [customBioError, setCustomBioError] = useState<string | null>(null);
  const [facebookUrlDraft, setFacebookUrlDraft] = useState("");
  const [instagramUrlDraft, setInstagramUrlDraft] = useState("");
  const [linkedinUrlDraft, setLinkedinUrlDraft] = useState("");
  const [youtubeUrlDraft, setYoutubeUrlDraft] = useState("");
  const [publicWebsiteDraft, setPublicWebsiteDraft] = useState("");
  const [leadCaptureDraft, setLeadCaptureDraft] = useState<AgentPageLeadCapture | null>(null);
  const leadCaptureMutating = useRef(false);

  useEffect(() => {
    if (!data) return;
    setSlugDraft(data.agentPageSlug || "");
    setSlugError(null);
    setCustomBioDraft(data.agentPageBio || "");
    setCustomBioError(null);
    setPublicWebsiteDraft(data.publicWebsite || "");
    setFacebookUrlDraft(data.facebookUrl || "");
    setInstagramUrlDraft(data.instagramUrl || "");
    setLinkedinUrlDraft(data.linkedinUrl || "");
    setYoutubeUrlDraft(data.youtubeUrl || "");
  }, [
    data?.agentPageSlug,
    data?.agentPageBio,
    data?.agentPageUseCustomBio,
    data?.publicWebsite,
    data?.facebookUrl,
    data?.instagramUrl,
    data?.linkedinUrl,
    data?.youtubeUrl,
  ]);

  const serverLeadCapture = normalizeLeadCapture(data?.agentPagePreferredLeadCapture);
  const leadCaptureValue = leadCaptureDraft ?? serverLeadCapture;

  useEffect(() => {
    if (leadCaptureMutating.current) return;
    setLeadCaptureDraft(null);
  }, [serverLeadCapture]);

  useEffect(() => {
    logRgeSelect(
      "PublicAgentPageSettingsCard",
      "preferredLeadCapture",
      serverLeadCapture,
      leadCaptureDraft,
      leadCaptureValue,
      "value-prop",
    );
  }, [serverLeadCapture, leadCaptureDraft, leadCaptureValue]);

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
    onSuccess: (payload) => {
      queryClient.setQueryData(["/api/agent-page"], payload);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/listings/publication-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      leadCaptureMutating.current = false;
      setLeadCaptureDraft(null);
      toast({ title: "Agent page settings saved" });
    },
    onError: (e: Error) => {
      leadCaptureMutating.current = false;
      setLeadCaptureDraft(null);
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

  const handleLeadCaptureChange = useCallback(
    (value: string) => {
      const next = normalizeLeadCapture(value);
      logRgeSelect(
        "PublicAgentPageSettingsCard",
        "preferredLeadCapture",
        serverLeadCapture,
        leadCaptureDraft,
        next,
        "change",
      );
      if (next === leadCaptureValue) return;
      if (next === serverLeadCapture) {
        setLeadCaptureDraft(null);
        return;
      }
      leadCaptureMutating.current = true;
      setLeadCaptureDraft(next);
      saveMutation.mutate({ agentPagePreferredLeadCapture: next });
    },
    [leadCaptureDraft, leadCaptureValue, saveMutation, serverLeadCapture],
  );

  const bulkPublishMutation = useMutation({
    mutationFn: bulkPublishEligibleListings,
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["/api/agent-page"],
        (prev: AgentPageSettingsResponse | undefined) => {
          if (!prev) return prev;
          return {
            ...prev,
            publishedOnAgentPage: prev.publishedOnAgentPage + result.published,
            eligibleToPublish: Math.max(0, prev.eligibleToPublish - result.published),
            hiddenUnpublished: Math.max(0, prev.hiddenUnpublished - result.published),
          };
        },
      );
      toast({
        title: "Listings published",
        description: `${result.published.toLocaleString()} listing${result.published === 1 ? "" : "s"} now appear on your Agent Page.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Bulk publish failed", description: e.message, variant: "destructive" });
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

  const saveProfileLink = useCallback(
    (
      field: "publicWebsite" | "facebookUrl" | "instagramUrl" | "linkedinUrl" | "youtubeUrl",
      draft: string,
    ) => {
      const trimmed = draft.trim();
      const current = (data?.[field] || "").trim();
      if (trimmed === current) return;
      saveMutation.mutate({ [field]: trimmed || null });
    },
    [
      data?.publicWebsite,
      data?.facebookUrl,
      data?.instagramUrl,
      data?.linkedinUrl,
      data?.youtubeUrl,
      saveMutation,
    ],
  );

  const agentDisplayUrl = data?.publicPageUrl ?? null;
  const pageIsPublic = Boolean(agentDisplayUrl);

  if (isError && !data) {
    return <p role="alert" className="rounded-xl border bg-white p-4 text-sm text-slate-700">Unable to load Agent Page settings.</p>;
  }

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

  const publishStatusLabel = pageIsPublic ? "Live" : "Offline";

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
      <header className="space-y-3 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <Globe className="h-4 w-4 shrink-0 text-brand-green" />
              Public Agent Page
            </h2>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", publishStatusClass)}
              data-testid="agent-page-active-status">{publishStatusLabel}</span>
          </div>
            <div className="flex items-center gap-3 shrink-0">
              <Label htmlFor="agent-page-enabled" className="text-sm font-medium">
                Enable page
              </Label>
              <Switch
                id="agent-page-enabled"
                checked={data.agentPageEnabled}
                disabled={saveMutation.isPending}
                onCheckedChange={(checked) => {
                  if (checked === data.agentPageEnabled) return;
                  saveMutation.mutate({ agentPageEnabled: checked });
                }}
              />
            </div>

        </div>
        <div data-testid="agent-page-url-block">
              {agentDisplayUrl ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
                  <p className="min-w-0 break-all text-sm text-slate-800">{agentDisplayUrl}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(agentDisplayUrl);
                          toast({ title: "Link copied" });
                        } catch {
                          toast({ title: "Could not copy the link", variant: "destructive" });
                        }
                      }}
                    >
                      <Copy className="h-3.5 w-3.5 mr-1.5" />
                      Copy Link
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={agentDisplayUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Open Page
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Enabling the page publishes your profile and makes it eligible for search.
                </p>
              )}
        </div>
      </header>

      <NeighborhoodPageSettings publicPageUrl={agentDisplayUrl} />
      <div data-testid="agent-page-controls-column">
        <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-profile-column">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Profile and branding</summary>
          <div className="mt-4 space-y-4">
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
        </details>
        <details className="border-t border-slate-200 px-4 py-3 sm:px-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Contact and lead capture</summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2" data-testid="agent-page-primary-contact-button">
              <Label>Primary contact button</Label>
              <Select value={leadCaptureValue} onValueChange={handleLeadCaptureChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webchat">Web chat</SelectItem>
                  <SelectItem value="email">Contact form</SelectItem>
                  <SelectItem value="phone">Phone call</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-snug">
                Web chat and forms create CRM leads in your Inbox. Phone opens the visitor&apos;s dialer and may not be tracked.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="agent-page-home-worth" className="text-sm font-medium">
                Show Home Value CTA
              </Label>
              <Switch
                id="agent-page-home-worth"
                checked={data.agentPageShowHomeValueCta}
                disabled={saveMutation.isPending}
                onCheckedChange={(checked) => {
                  if (checked === data.agentPageShowHomeValueCta) return;
                  saveMutation.mutate({ agentPageShowHomeValueCta: checked });
                }}
              />
            </div>
          </div>
        </details>
        <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-publish-status">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Listing visibility</summary>
          <div className="mt-4 space-y-4">
              <div
                className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50/80 p-3"
                data-testid="publish-listings-publicly-toggle"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">Publish listings publicly</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Show individually published, MLS-eligible listings on your Agent Page and include them
                    in property search discovery.
                  </p>
                </div>
                <Switch
                  checked={data.publishListingsPublicly}
                  disabled={saveMutation.isPending}
                  onCheckedChange={(checked) => {
                    if (checked === data.publishListingsPublicly) return;
                    saveMutation.mutate({ publishListingsPublicly: checked });
                  }}
                  aria-label="Publish listings publicly"
                />
              </div>
              {data.publishListingsPublicly && pageIsPublic && (
                <div className="space-y-2 pt-1" data-testid="agent-page-listing-publish">
                  <p className="text-xs text-muted-foreground leading-snug">
                    <span className="font-medium text-gray-800 tabular-nums">
                      {data.publishedOnAgentPage.toLocaleString()}
                    </span>{" "}
                    listings on your Agent Page
                    {data.eligibleToPublish > 0 ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="tabular-nums">{data.eligibleToPublish.toLocaleString()}</span> eligible
                        to publish
                      </>
                    ) : null}
                  </p>
                  {data.publishedOnAgentPage === 0 && data.eligibleToPublish > 0 && (
                    <p className="text-xs text-amber-700 leading-snug">
                      Synced listings are not shown on your Agent Page until they are published.
                    </p>
                  )}
                  {data.eligibleToPublish > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      disabled={bulkPublishMutation.isPending}
                      onClick={() => bulkPublishMutation.mutate()}
                      data-testid="button-bulk-publish-listings"
                    >
                      {bulkPublishMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Publishing…
                        </>
                      ) : (
                        `Publish ${data.eligibleToPublish.toLocaleString()} eligible listings`
                      )}
                    </Button>
                  )}
                </div>
              )}
          </div>
        </details>
            <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-social-links">
              <summary className="cursor-pointer select-none text-sm font-medium text-gray-800">Website &amp; social links</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground leading-snug">Optional. Icons appear on your public page when a link is set.</p>
              <div className="space-y-2">
                <Label htmlFor="agent-page-website">Website URL</Label>
                <Input
                  id="agent-page-website"
                  type="url"
                  inputMode="url"
                  placeholder="https://yourwebsite.com"
                  value={publicWebsiteDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setPublicWebsiteDraft(e.target.value)}
                  onBlur={() => saveProfileLink("publicWebsite", publicWebsiteDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-facebook">Facebook URL</Label>
                <Input
                  id="agent-page-facebook"
                  type="url"
                  inputMode="url"
                  placeholder="https://facebook.com/..."
                  value={facebookUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setFacebookUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("facebookUrl", facebookUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-instagram">Instagram URL</Label>
                <Input
                  id="agent-page-instagram"
                  type="url"
                  inputMode="url"
                  placeholder="https://instagram.com/..."
                  value={instagramUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setInstagramUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("instagramUrl", instagramUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-linkedin">LinkedIn URL</Label>
                <Input
                  id="agent-page-linkedin"
                  type="url"
                  inputMode="url"
                  placeholder="https://linkedin.com/in/..."
                  value={linkedinUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setLinkedinUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("linkedinUrl", linkedinUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-youtube">YouTube URL</Label>
                <Input
                  id="agent-page-youtube"
                  type="url"
                  inputMode="url"
                  placeholder="https://youtube.com/@..."
                  value={youtubeUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setYoutubeUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("youtubeUrl", youtubeUrlDraft)}
                />
              </div>
              </div>
            </details>
              {data.agentPageSlug && agentDisplayUrl && data.publishListingsPublicly ? (
                <AgentPageEmbedCodeBlock
                  slug={data.agentPageSlug}
                  appOrigin={new URL(agentDisplayUrl).origin}
                />
              ) : null}
        <details className="border-t border-slate-200 px-4 py-3 sm:px-6">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Advanced settings</summary>
          <div className="mt-4 space-y-4">
            <Label htmlFor="agent-page-slug">Agent URL path</Label>
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
        </details>
      </div>
    </section>
  );
}
