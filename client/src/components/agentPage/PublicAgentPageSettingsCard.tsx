import { useTranslation } from "react-i18next";
import { NeighborhoodPageSettings } from "./NeighborhoodPageSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Globe, Loader2 } from "lucide-react";
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
import { fetchAgentPageSettings } from "@/lib/agentPageApi";
import { bulkPublishEligibleListings } from "@/lib/inventoryApi";
import { logRgeSelect } from "@/lib/rgeSelectDebug";
import { AgentPageMarketAreaChips } from "@/components/agentPage/AgentPageMarketAreaChips";

const BUSINESS_PROFILE_SETTINGS_PATH = "/app/settings";
const DEFAULT_LEAD_CAPTURE: AgentPageLeadCapture = "webchat";

function AgentPageEmbedCodeBlock({ slug, appOrigin }: { slug: string; appOrigin: string }) {
  const { t } = useTranslation();
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

  const copySnippet = async (message: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast({ title: message });
    } catch {
      toast({ title: t("rgeAgent.embedError"), description: t("rgeNeighborhood.clipboardHelp"), variant: "destructive" });
    }
  };

  return (
    <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-embed-code">
      <summary className="cursor-pointer select-none text-sm font-medium text-gray-800">
        {t("rgeAgent.embed")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted-foreground leading-snug">
          {t("rgeAgent.embedHelp")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copySnippet(t("rgeNeighborhood.saleEmbedCopied"), saleSnippet)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {t("rgeAgent.copySales")}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void copySnippet(t("rgeNeighborhood.rentEmbedCopied"), rentSnippet)}>
            <Copy className="h-3.5 w-3.5 mr-1.5" />
            {t("rgeAgent.copyRent")}
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
  const { t, i18n } = useTranslation();
  const formatCount = (count: number) => count.toLocaleString(i18n.resolvedLanguage);
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
        throw new Error(payload.code ?? "");
      }
      return payload as AgentPageSettingsResponse;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(["/api/agent-page"], payload);
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/listings/publication-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      leadCaptureMutating.current = false;
      setLeadCaptureDraft(null);
      toast({ title: t("rgeAgent.saved") });
    },
    onError: (e: Error) => {
      leadCaptureMutating.current = false;
      setLeadCaptureDraft(null);
      toast({ title: t("rgeAgent.saveError"), description: e.message === "slug_taken" ? t("rgeNeighborhood.slugTaken")
        : e.message === "rge_required" ? t("rgeNeighborhood.accessRequired")
        : e.message === "invalid_slug" ? t("rgeNeighborhood.slugInvalid")
        : e.message === "validation_error" ? t("rgeNeighborhood.checkFields")
        : undefined,
        variant: "destructive" });
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
      if (!res.ok) throw new Error();
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
        title: t("rgeAgent.published"),
        description: t("rgeNeighborhood.publishedListings", { count: result.published }),
      });
    },
    onError: () => {
      toast({ title: t("rgeAgent.bulkError"), variant: "destructive" });
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
        setSlugError(t("rgeNeighborhood.slugInvalid"));
        return;
      }
      setSlugError(null);
      saveMutation.mutate({ agentPageSlug: validated.slug });
    },
    [data?.agentPageSlug, saveMutation, t],
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
    return <p role="alert" className="rounded-xl border bg-white p-4 text-sm text-slate-700">{t("rgeAgent.loadError")}</p>;
  }

  if (isLoading || !data) {
    return (
      <div
        className={cn("rounded-xl border border-gray-200 bg-white px-4 py-8", className)}
        data-testid="public-agent-page-settings"
      >
        <div className="flex justify-center text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
          {t("rgeAgent.loading")}
        </div>
      </div>
    );
  }

  const publishStatusLabel = pageIsPublic ? t("rgeNeighborhood.active") : t("rgeNeighborhood.inactive");

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
              {t("rgeAgent.publicPage")}
            </h2>
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", publishStatusClass)}
              data-testid="agent-page-active-status">{publishStatusLabel}</span>
          </div>
            <div className="flex items-center gap-3 shrink-0">
              <Label htmlFor="agent-page-enabled" className="text-sm font-medium">
                {t("rgeAgent.enable")}
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
                  <div className="flex items-center gap-1" role="group" aria-label={t("rgeAgent.actions")}>
                    <Button asChild variant="ghost" size="icon" className="h-9 w-9 text-slate-600 hover:bg-slate-200 hover:text-slate-900">
                      <a href={agentDisplayUrl} target="_blank" rel="noopener noreferrer" aria-label={t("rgeAgent.view")} title={t("rgeAgent.view")}>
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                      aria-label={t("rgeAgent.copyLink")}
                      title={t("rgeAgent.copyLink")}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(agentDisplayUrl);
                          toast({ title: t("rgeAgent.copied") });
                        } catch {
                          toast({ title: t("rgeAgent.copyError"), variant: "destructive" });
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("rgeAgent.enableHelp")}
                </p>
              )}
        </div>
      </header>

      <NeighborhoodPageSettings publicPageUrl={agentDisplayUrl} />
      <div data-testid="agent-page-controls-column">
        <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-profile-column">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{t("rgeAgent.profile")}</summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {t("rgeAgent.managed")}
                </p>
                <Button asChild variant="outline" size="sm" className="h-8 w-fit">
                  <Link href={BUSINESS_PROFILE_SETTINGS_PATH}>{t("rgeAgent.editProfile")}</Link>
                </Button>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("rgeAgent.displayName")}</p>
                <p className="text-sm font-medium text-gray-900" data-testid="agent-page-inherited-name">
                  {data.businessProfileDisplayName}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{t("rgeAgent.defaultAbout")}</p>
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
                {t("rgeAgent.customBio")}
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
                      t("rgeNeighborhood.bioRequired"),
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
                <Label htmlFor="agent-page-bio">{t("rgeAgent.bio")}</Label>
                <Textarea
                  id="agent-page-bio"
                  rows={4}
                  value={customBioDraft}
                  placeholder={t("rgeAgent.bioExample")}
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
              <Label htmlFor="agent-page-market">{t("rgeAgent.market")}</Label>
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
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{t("rgeAgent.contact")}</summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2" data-testid="agent-page-primary-contact-button">
              <Label>{t("rgeAgent.primaryButton")}</Label>
              <Select value={leadCaptureValue} onValueChange={handleLeadCaptureChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webchat">{t("rgeAgent.webChat")}</SelectItem>
                  <SelectItem value="email">{t("rgeAgent.form")}</SelectItem>
                  <SelectItem value="phone">{t("rgeAgent.call")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground leading-snug">
                {t("rgeAgent.contactHelp")}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="agent-page-home-worth" className="text-sm font-medium">
                {t("rgeAgent.homeValue")}
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
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{t("rgeAgent.listingVisibility")}</summary>
          <div className="mt-4 space-y-4">
              <div
                className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50/80 p-3"
                data-testid="publish-listings-publicly-toggle"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{t("rgeAgent.publishListings")}</p>
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t("rgeAgent.publishHelp")}
                  </p>
                </div>
                <Switch
                  checked={data.publishListingsPublicly}
                  disabled={saveMutation.isPending}
                  onCheckedChange={(checked) => {
                    if (checked === data.publishListingsPublicly) return;
                    saveMutation.mutate({ publishListingsPublicly: checked });
                  }}
                  aria-label={t("rgeAgent.publishListings")}
                />
              </div>
              {data.publishListingsPublicly && pageIsPublic && (
                <div className="space-y-2 pt-1" data-testid="agent-page-listing-publish">
                  <p className="text-xs text-muted-foreground leading-snug">
                    {t("rgeNeighborhood.listingsTotal", { total: formatCount(data.publishedOnAgentPage) })}
                    {data.eligibleToPublish > 0 && (
                      <> · {t("rgeNeighborhood.listingsEligible", { total: formatCount(data.eligibleToPublish) })}</>
                    )}
                  </p>
                  {data.publishedOnAgentPage === 0 && data.eligibleToPublish > 0 && (
                    <p className="text-xs text-amber-700 leading-snug">
                      {t("rgeAgent.notPublished")}
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
                          {t("rgeAgent.publishing")}
                        </>
                      ) : (
                        t("rgeNeighborhood.publishEligible", { total: formatCount(data.eligibleToPublish) })
                      )}
                    </Button>
                  )}
                </div>
              )}
          </div>
        </details>
            <details className="border-t border-slate-200 px-4 py-3 sm:px-6" data-testid="agent-page-social-links">
              <summary className="cursor-pointer select-none text-sm font-medium text-gray-800">{t("rgeAgent.social")}</summary>
              <div className="mt-3 space-y-3">
                <p className="text-xs text-muted-foreground leading-snug">{t("rgeAgent.socialHelp")}</p>
              <div className="space-y-2">
                <Label htmlFor="agent-page-website">{t("rgeAgent.website")}</Label>
                <Input
                  id="agent-page-website"
                  type="url"
                  inputMode="url"
                  dir="ltr" placeholder="https://yourwebsite.com"
                  value={publicWebsiteDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setPublicWebsiteDraft(e.target.value)}
                  onBlur={() => saveProfileLink("publicWebsite", publicWebsiteDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-facebook">{t("rgeAgent.facebook")}</Label>
                <Input
                  id="agent-page-facebook"
                  type="url"
                  inputMode="url"
                  dir="ltr" placeholder="https://facebook.com/..."
                  value={facebookUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setFacebookUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("facebookUrl", facebookUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-instagram">{t("rgeAgent.instagram")}</Label>
                <Input
                  id="agent-page-instagram"
                  type="url"
                  inputMode="url"
                  dir="ltr" placeholder="https://instagram.com/..."
                  value={instagramUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setInstagramUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("instagramUrl", instagramUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-linkedin">{t("rgeAgent.linkedin")}</Label>
                <Input
                  id="agent-page-linkedin"
                  type="url"
                  inputMode="url"
                  dir="ltr" placeholder="https://linkedin.com/in/..."
                  value={linkedinUrlDraft}
                  disabled={saveMutation.isPending}
                  onChange={(e) => setLinkedinUrlDraft(e.target.value)}
                  onBlur={() => saveProfileLink("linkedinUrl", linkedinUrlDraft)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="agent-page-youtube">{t("rgeAgent.youtube")}</Label>
                <Input
                  id="agent-page-youtube"
                  type="url"
                  inputMode="url"
                  dir="ltr" placeholder="https://youtube.com/@..."
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
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">{t("rgeAgent.advanced")}</summary>
          <div className="mt-4 space-y-4">
            <Label htmlFor="agent-page-slug">{t("rgeAgent.path")}</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="agent-page-slug"
                  value={slugDraft}
                  dir="ltr" placeholder="jane-smith-a1b2c3d4"
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
                    } catch {
                      toast({
                        title: t("rgeAgent.slugError"),
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  {t("rgeAgent.suggestSlug")}
                </Button>
              </div>
              {slugError ? (
                <p className="text-xs text-destructive" role="alert">
                  {slugError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("rgeAgent.pathExample")}</p>
              )}
          </div>
        </details>
      </div>
    </section>
  );
}
