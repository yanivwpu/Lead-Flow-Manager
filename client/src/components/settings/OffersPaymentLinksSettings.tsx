/**
 * Settings → Offers & Payment Links
 * Workspace-admin editor for structured offers used by AI Brain Live Business Data.
 */

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

export function OffersPaymentLinksSettings() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<OfferForm>(EMPTY_FORM);

  const offersQuery = useQuery<{ offers: Offer[] }>({
    queryKey: OFFERS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/workspace-offers", { credentials: "include" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(typeof err.error === "string" ? err.error : "Failed to load offers");
      }
      return res.json();
    },
  });

  const offers = offersQuery.data?.offers ?? [];
  const activeCount = useMemo(() => offers.filter((o) => o.active).length, [offers]);

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
        const res = await apiRequest("PATCH", `/api/workspace-offers/${editingId}`, body);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/workspace-offers", body);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/live-business-data"] });
      setCreating(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      toast({ title: "Offer saved" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not save offer", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/workspace-offers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["/api/ai/live-business-data"] });
      if (editingId) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
      toast({ title: "Offer archived" });
    },
    onError: (err: Error) => {
      toast({ title: "Could not archive offer", description: err.message, variant: "destructive" });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await apiRequest("POST", "/api/workspace-offers/reorder", { orderedIds });
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: OFFERS_KEY });
    },
    onError: (err: Error) => {
      toast({ title: "Could not reorder", description: err.message, variant: "destructive" });
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
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Offers & Payment Links</h2>
            <p className="text-sm leading-relaxed text-gray-600">
              Structured packages AI can quote accurately — prices, benefits, and checkout links you control.
              Website scans stay marketing context only.
            </p>
            <p className="text-xs text-gray-500">
              {activeCount === 0
                ? "Not configured — add an active offer for AI pricing answers."
                : `${activeCount} active offer${activeCount === 1 ? "" : "s"} · payment links require human approval before send`}
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
            Add offer
          </Button>
        )}
      </div>

      {offersQuery.isLoading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading offers…
        </div>
      ) : offers.length === 0 && !showEditor ? (
        <p className="mt-4 rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-4 text-sm text-gray-600">
          No offers yet. Add packages, retainers, or listing products with an HTTPS checkout link (Stripe Payment Links,
          PayPal, and other providers are fine).
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
                <p className="truncate font-medium text-gray-900">{offer.displayName}</p>
                <p className="truncate text-xs text-gray-500">
                  {[offer.priceDisplay, offer.billingCadence !== "once" ? offer.billingCadence : null]
                    .filter(Boolean)
                    .join(" · ") || "No price set"}
                  {offer.checkoutUrl ? " · Checkout set" : " · No checkout URL"}
                </p>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  offer.active ? "bg-emerald-100 text-emerald-900" : "bg-gray-100 text-gray-600",
                )}
              >
                {offer.active ? "Active" : "Inactive"}
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={index === 0 || reorderMutation.isPending}
                  onClick={() => moveOffer(offer.id, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={index === offers.length - 1 || reorderMutation.isPending}
                  onClick={() => moveOffer(offer.id, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
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
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-gray-500 hover:text-red-700"
                  onClick={() => {
                    if (window.confirm(`Archive “${offer.displayName}”? AI will stop using it.`)) {
                      archiveMutation.mutate(offer.id);
                    }
                  }}
                  aria-label="Archive offer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showEditor && (
        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3 sm:p-4">
          <p className="text-sm font-semibold text-gray-900">
            {creating ? "New offer" : "Edit offer"}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-display-name">Display name</Label>
              <Input
                id="offer-display-name"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Featured Business"
                data-testid="input-offer-display-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-internal-name">Internal name</Label>
              <Input
                id="offer-internal-name"
                value={form.internalName}
                onChange={(e) => setForm((f) => ({ ...f, internalName: e.target.value }))}
                placeholder="featured-business"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-category">Category</Label>
              <Input
                id="offer-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Advertising"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-price">Price display</Label>
              <Input
                id="offer-price"
                value={form.priceDisplay}
                onChange={(e) => setForm((f) => ({ ...f, priceDisplay: e.target.value }))}
                placeholder="$99/mo"
                data-testid="input-offer-price"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Billing cadence</Label>
              <Select
                value={form.billingCadence}
                onValueChange={(v) => setForm((f) => ({ ...f, billingCadence: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">One-time</SelectItem>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-checkout">Checkout URL (HTTPS)</Label>
              <Input
                id="offer-checkout"
                value={form.checkoutUrl}
                onChange={(e) => setForm((f) => ({ ...f, checkoutUrl: e.target.value }))}
                placeholder="https://buy.stripe.com/…"
                data-testid="input-offer-checkout-url"
              />
              <p className="text-[11px] text-gray-500">
                Public payment links only — not Stripe <code className="text-[10px]">price_…</code> IDs.
              </p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-followup">Follow-up / onboarding URL (optional)</Label>
              <Input
                id="offer-followup"
                value={form.followUpUrl}
                onChange={(e) => setForm((f) => ({ ...f, followUpUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-benefits">Benefits (one per line)</Label>
              <Textarea
                id="offer-benefits"
                value={form.benefitsText}
                onChange={(e) => setForm((f) => ({ ...f, benefitsText: e.target.value }))}
                rows={4}
                placeholder={"Homepage placement\nPriority support"}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-description">Description (optional)</Label>
              <Textarea
                id="offer-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="offer-guidance">AI guidance (optional)</Label>
              <Textarea
                id="offer-guidance"
                value={form.aiGuidance}
                onChange={(e) => setForm((f) => ({ ...f, aiGuidance: e.target.value }))}
                rows={2}
                placeholder="Recommend this for businesses that want more visibility…"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Availability</Label>
              <Select
                value={form.availability}
                onValueChange={(v) => setForm((f) => ({ ...f, availability: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="limited">Limited</SelectItem>
                  <SelectItem value="waitlist">Waitlist</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-[11px] text-gray-500">Inactive offers are hidden from AI.</p>
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
                  Saving…
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
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
