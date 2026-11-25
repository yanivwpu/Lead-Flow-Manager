import { formatRegionalNumber } from "@/lib/regionalFormatting";
/**
 * Settings → Offers & Payment Links
 * Workspace-admin editor for structured offers used by AI Brain Live Business Data.
 */

import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Offer = {
  id: string;
  archivedAt?: string | null;
  internalName: string;
  displayName: string;
  description: string | null;
  benefits: string[];
  priceDisplay: string | null;
  billingCadence: string;
  checkoutUrl: string | null;
  followUpUrl: string | null;
  availability: string;
  active: boolean;
  sortOrder: number;
  category: string | null;
  tags: string[];
  aiGuidance: string | null;
};

type OfferForm = {
  internalName: string;
  displayName: string;
  description: string;
  benefitsText: string;
  priceDisplay: string;
  billingCadence: string;
  checkoutUrl: string;
  followUpUrl: string;
  availability: string;
  active: boolean;
  category: string;
  tagsText: string;
  aiGuidance: string;
};

const EMPTY_FORM: OfferForm = {
  internalName: "",
  displayName: "",
  description: "",
  benefitsText: "",
  priceDisplay: "",
  billingCadence: "month",
  checkoutUrl: "",
  followUpUrl: "",
  availability: "available",
  active: true,
  category: "",
  tagsText: "",
  aiGuidance: "",
};

const OFFERS_KEY = ["/api/workspace-offers"] as const;

function formFromOffer(offer: Offer): OfferForm {
  return {
    internalName: offer.internalName || "",
    displayName: offer.displayName || "",
    description: offer.description || "",
    benefitsText: (offer.benefits || []).join("\n"),
    priceDisplay: offer.priceDisplay || "",
    billingCadence: offer.billingCadence || "once",
    checkoutUrl: offer.checkoutUrl || "",
    followUpUrl: offer.followUpUrl || "",
    availability: offer.availability || "available",
    active: Boolean(offer.active),
    category: offer.category || "",
    tagsText: (offer.tags || []).join(", "),
    aiGuidance: offer.aiGuidance || "",
  };
}

function payloadFromForm(form: OfferForm) {
  return {
    internalName: form.internalName.trim() || form.displayName.trim(),
    displayName: form.displayName.trim(),
    description: form.description.trim() || null,
    benefits: form.benefitsText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean),
    priceDisplay: form.priceDisplay.trim() || null,
    billingCadence: form.billingCadence,
    checkoutUrl: form.checkoutUrl.trim() || null,
    followUpUrl: form.followUpUrl.trim() || null,
    availability: form.availability,
    active: form.active,
    category: form.category.trim() || null,
    tags: form.tagsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    aiGuidance: form.aiGuidance.trim() || null,
  };
}

export function OffersPaymentLinksSettings({
  catalog = false,
}: {
  catalog?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const cadenceLabels: Record<string, string> = {
    once: t("offerUi.oneTime"),
    week: t("offerUi.weekly"),
    month: t("offerUi.monthly"),
    quarter: t("offerUi.quarterly"),
    year: t("offerUi.yearly"),
    custom: t("offerUi.custom"),
  };
  const { user, sessionAligned } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const catalogParams = new URLSearchParams({
    query,
    status,
    category,
    offset: String(offset),
    limit: "25",
  });
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);
  useEffect(() => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY_FORM);
    setOffset(0);
  }, [user?.id]);

  const offersQuery = useQuery<{ offers: Offer[]; nextOffset?: number | null }>(
    {
      queryKey: catalog
        ? ["/api/sales-catalog", user?.id, query, status, category, offset]
        : [...OFFERS_KEY, user?.id],
      enabled: !!user && sessionAligned,
      queryFn: async () => {
        const res = await fetch(
          catalog
            ? `/api/sales-catalog?${catalogParams}`
            : "/api/workspace-offers",
          { credentials: "include" },
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            typeof err.error === "string" ? err.error : "Failed to load offers",
          );
        }
        const data = await res.json();
        return catalog
          ? { offers: data.items, nextOffset: data.nextOffset }
          : data;
      },
    },
  );

  const offers = offersQuery.data?.offers ?? [];
  const activeCount = useMemo(
    () => offers.filter((o) => o.active).length,
    [offers],
  );

  useEffect(() => {
    if (!editingId) return;
    const offer = offers.find((o) => o.id === editingId);
    if (offer) setForm(formFromOffer(offer));
  }, [editingId, offers]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = payloadFromForm(form);
      if (!body.displayName) throw new Error("Display name is required");
      if (editingId) {
        const res = await apiRequest(
          "PATCH",
          `/api/workspace-offers/${editingId}`,
          body,
        );
        return res.json();
      }
      const res = await apiRequest("POST", "/api/workspace-offers", body);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/sales-catalog"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/ai/live-business-data"],
      });
      setCreating(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast({ title: t("catalog3d.saved") });
    },
    onError: (err: Error) => {
      toast({
        title: t("catalog3d.saveError"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/workspace-offers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/sales-catalog"] });
      void queryClient.invalidateQueries({
        queryKey: ["/api/ai/live-business-data"],
      });
      if (editingId) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      toast({ title: t("catalog3d.archived") });
    },
    onError: (err: Error) => {
      toast({
        title: t("catalog3d.archiveError"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await apiRequest("POST", "/api/workspace-offers/reorder", {
        orderedIds,
      });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/sales-catalog"] });
    },
    onError: (err: Error) => {
      toast({
        title: t("catalog3d.reorderError"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function moveOffer(id: string, direction: -1 | 1) {
    const ids = offers.map((o) => o.id);
    const idx = ids.indexOf(id);
    const swap = idx + direction;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    const next = [...ids];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    reorderMutation.mutate(next);
  }

  const showEditor = creating || Boolean(editingId);

  return (
    <div
      id="settings-offers"
      className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 shadow-none"
      data-testid="settings-offers-payment-links"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <div
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700"
            aria-hidden
          >
            <Tag className="h-4 w-4" />
          </div>
          <div className="min-w-0 space-y-1">
            <h2 className="text-base sm:text-lg font-bold text-gray-900">
              {t("manualCatalog.title")}
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              {t("catalog3d.structured")}
            </p>
            <p className="text-xs text-gray-500">
              {catalog
                ? t(
                    "salesCatalog.approval",
                    "Payment links require human approval before send.",
                  )
                : activeCount === 0
                  ? t("catalog3d.notConfigured")
                  : t("catalog3d.activeOffers", { count: activeCount, total: formatRegionalNumber(activeCount, i18n.language) })}
            </p>
          </div>
        </div>
        {!showEditor && (
          <Button
            type="button"
            className="h-9 shrink-0"
            onClick={() => {
              setCreating(true);
              setEditingId(null);
              setForm(EMPTY_FORM);
            }}
            data-testid="button-add-offer"
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            {t("manualCatalog.add")}
          </Button>
        )}
      </div>

      {catalog && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Input
            aria-label={t("salesCatalog.search", "Search catalog")}
            placeholder={t("salesCatalog.search", "Search catalog")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setOffset(0);
            }}
          >
            <SelectTrigger aria-label={t("salesCatalog.status", "Status")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "active", "inactive", "archived", "purchasable"].map(
                (value) => (
                  <SelectItem key={value} value={value}>
                    {t(`salesCatalog.${value}`, value)}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Input
            aria-label={t("salesCatalog.category", "Category")}
            placeholder={t("salesCatalog.category", "Category")}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setOffset(0);
            }}
          />
        </div>
      )}
      {offersQuery.isError && (
        <div role="alert" className="mt-4 text-sm text-red-700">
          {t("catalog3d.loadError")}{" "}
          <Button variant="outline" onClick={() => void offersQuery.refetch()}>
            {t("salesCatalog.retry", "Retry")}
          </Button>
        </div>
      )}
      {offersQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("manualCatalog.loading")}
        </div>
      ) : offersQuery.isError ? null : offers.length === 0 && !showEditor ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-4 text-sm text-gray-600">
          {catalog
            ? t(
                "salesCatalog.empty",
                "No matching items. Change your filters or add an offer.",
              )
            : t("manualCatalog.empty")}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
          {offers.map((offer, index) => (
            <li
              key={offer.id}
              className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
              data-testid={`offer-row-${offer.id}`}
            >
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate font-medium text-gray-900">
                  {offer.displayName}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {[
                    offer.priceDisplay,
                    offer.billingCadence === "once" ? null : cadenceLabels[offer.billingCadence] ?? offer.billingCadence,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("catalog3d.noPrice")}
                  {offer.checkoutUrl ? t("catalog3d.checkoutSet") : t("catalog3d.noCheckout")}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  offer.active
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-gray-100 text-gray-600",
                )}
              >
                {offer.archivedAt
                  ? t("salesCatalog.archived", "Archived")
                  : offer.active
                    ? t("salesCatalog.active")
                    : t("salesCatalog.inactive")}
              </span>
              <div className="flex items-center gap-0.5">
                {!catalog && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={index === 0 || reorderMutation.isPending}
                      onClick={() => moveOffer(offer.id, -1)}
                      aria-label={t("workflowEditor.moveUp")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={
                        index === offers.length - 1 || reorderMutation.isPending
                      }
                      onClick={() => moveOffer(offer.id, 1)}
                      aria-label={t("workflowEditor.moveDown")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                {!offer.archivedAt && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setCreating(false);
                        setEditingId(offer.id);
                        setForm(formFromOffer(offer));
                      }}
                    >
                      {t("common.edit")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-red-700"
                      onClick={() => {
                        if (
                          window.confirm(
                            t("catalog3d.archiveConfirm", { name: offer.displayName }),
                          )
                        ) {
                          archiveMutation.mutate(offer.id);
                        }
                      }}
                      aria-label={t("manualCatalog.archive")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {catalog && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            disabled={offset === 0 || offersQuery.isFetching}
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            {t("salesCatalog.previous", "Previous")}
          </Button>
          <span className="text-sm text-gray-500">
            {t("salesCatalog.page", "Page")} {formatRegionalNumber(Math.floor(offset / 25) + 1, i18n.language)}
          </span>
          <Button
            variant="outline"
            disabled={
              offersQuery.data?.nextOffset == null || offersQuery.isFetching
            }
            onClick={() => setOffset(offersQuery.data?.nextOffset ?? 0)}
          >
            {t("salesCatalog.next", "Next")}
          </Button>
        </div>
      )}
      {showEditor && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:p-4">
          <p className="text-sm font-semibold text-gray-900">
            {creating ? t("manualCatalog.newOffer") : t("manualCatalog.editOffer")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-display-name">{t("offerUi.displayName")}</Label>
              <Input
                id="offer-display-name"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder={t("catalog3d.exampleName")}
                data-testid="input-offer-display-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-internal-name">{t("offerUi.internalName")}</Label>
              <Input
                id="offer-internal-name"
                value={form.internalName}
                onChange={(e) => setForm((f) => ({ ...f, internalName: e.target.value }))}
                placeholder="featured-business"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-category">{t("offerUi.category")}</Label>
              <Input
                id="offer-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={t("catalog3d.exampleCategory")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-price">{t("offerUi.priceDisplay")}</Label>
              <Input
                id="offer-price"
                value={form.priceDisplay}
                onChange={(e) => setForm((f) => ({ ...f, priceDisplay: e.target.value }))}
                placeholder="$99/mo"
                data-testid="input-offer-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("offerUi.billingCadence")}</Label>
              <Select
                value={form.billingCadence}
                onValueChange={(v) => setForm((f) => ({ ...f, billingCadence: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">{cadenceLabels.once}</SelectItem>
                  <SelectItem value="week">{cadenceLabels.week}</SelectItem>
                  <SelectItem value="month">{cadenceLabels.month}</SelectItem>
                  <SelectItem value="quarter">{cadenceLabels.quarter}</SelectItem>
                  <SelectItem value="year">{cadenceLabels.year}</SelectItem>
                  <SelectItem value="custom">{cadenceLabels.custom}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-checkout">{t("offerUi.checkoutUrl")}</Label>
              <Input
                id="offer-checkout"
                value={form.checkoutUrl}
                onChange={(e) => setForm((f) => ({ ...f, checkoutUrl: e.target.value }))}
                placeholder="https://buy.stripe.com/…"
                data-testid="input-offer-checkout-url"
              />
              <p className="text-[11px] text-gray-500">
                {t("catalog3d.paymentHelp", { example: "price_…" })}
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-followup">{t("offerUi.followupUrl")}</Label>
              <Input
                id="offer-followup"
                value={form.followUpUrl}
                onChange={(e) => setForm((f) => ({ ...f, followUpUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-benefits">{t("offerUi.benefits")}</Label>
              <Textarea
                id="offer-benefits"
                value={form.benefitsText}
                onChange={(e) => setForm((f) => ({ ...f, benefitsText: e.target.value }))}
                rows={4}
                placeholder={t("catalog3d.benefitsExample")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-description">{t("offerUi.description")}</Label>
              <Textarea
                id="offer-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-guidance">{t("offerUi.guidance")}</Label>
              <Textarea
                id="offer-guidance"
                value={form.aiGuidance}
                onChange={(e) => setForm((f) => ({ ...f, aiGuidance: e.target.value }))}
                rows={2}
                placeholder={t("catalog3d.exampleGuidance")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("offerUi.availability")}</Label>
              <Select
                value={form.availability}
                onValueChange={(v) => setForm((f) => ({ ...f, availability: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{t("offerUi.available")}</SelectItem>
                  <SelectItem value="limited">{t("offerUi.limited")}</SelectItem>
                  <SelectItem value="waitlist">{t("offerUi.waitlist")}</SelectItem>
                  <SelectItem value="unavailable">{t("offerUi.unavailable")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{t("offerUi.active")}</p>
                <p className="text-[11px] text-gray-500">{t("offerUi.inactiveHint")}</p>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                data-testid="switch-offer-active"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              disabled={saveMutation.isPending || !form.displayName.trim()}
              onClick={() => saveMutation.mutate()}
              data-testid="button-save-offer"
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  {t("workspaceUi.saving")}
                </>
              ) : (
                "Save offer"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
                setForm(EMPTY_FORM);
              }}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
