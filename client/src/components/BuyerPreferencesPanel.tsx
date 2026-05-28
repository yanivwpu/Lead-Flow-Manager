import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, RefreshCw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildBuyerPreferenceChips,
  type BuyerPreferenceChip,
} from "@shared/buyerPreferenceDisplay";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BuyerPreferencesPanelProps {
  contactId: string;
  /** Raw profile from contact row (optional — refetched via API when visible). */
  initialProfile?: unknown;
  /** Show section when true (real-estate workspace, RGE, or buyer lead type). */
  visible: boolean;
  onUpdated?: () => void;
}

function ChipBadge({ chip }: { chip: BuyerPreferenceChip }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border max-w-full",
        chip.source === "explicit"
          ? "bg-violet-50 text-violet-800 border-violet-200"
          : "bg-gray-50 text-gray-700 border-gray-200",
      )}
      title={chip.source === "inferred" ? "Inferred from conversation" : "Saved explicitly"}
    >
      <span className="text-gray-500 shrink-0">{chip.label}:</span>
      <span className="truncate">{chip.value}</span>
    </span>
  );
}

export function BuyerPreferencesPanel({
  contactId,
  initialProfile,
  visible,
  onUpdated,
}: BuyerPreferencesPanelProps) {
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [areas, setAreas] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [beds, setBeds] = useState("");
  const [timeline, setTimeline] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [financing, setFinancing] = useState("");
  const [mustHaves, setMustHaves] = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [`/api/contacts/${contactId}/buyer-preferences`],
    enabled: visible && !!contactId,
    staleTime: 60_000,
  });

  const profile = (data as { profile?: unknown } | undefined)?.profile ?? initialProfile;
  const eligible = (data as { eligible?: boolean } | undefined)?.eligible ?? visible;
  const chips = useMemo(() => {
    const fromApi = (data as { chips?: BuyerPreferenceChip[] } | undefined)?.chips;
    if (fromApi?.length) return fromApi;
    return buildBuyerPreferenceChips(profile);
  }, [data, profile]);

  const openEdit = useCallback(() => {
    const p = profile as Record<string, { value?: unknown }> | undefined;
    setAreas((p?.targetAreas?.value as string[] | undefined)?.join(", ") || "");
    setBudgetMax(p?.priceMax?.value != null ? String(p.priceMax.value) : "");
    setBeds(p?.bedsMin?.value != null ? String(p.bedsMin.value) : "");
    setTimeline((p?.timeline?.value as string) || "");
    setPropertyType((p?.propertyTypes?.value as string[] | undefined)?.[0] || "");
    setFinancing((p?.financingStatus?.value as string) || "");
    setMustHaves((p?.mustHaves?.value as string[] | undefined)?.join(", ") || "");
    setEditOpen(true);
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      const areaList = areas.split(",").map((s) => s.trim()).filter(Boolean);
      if (areaList.length) body.targetAreas = areaList;
      const max = Number(budgetMax.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(max) && max > 0) body.priceMax = max;
      const bedsN = Number(beds);
      if (Number.isFinite(bedsN) && bedsN > 0) body.bedsMin = bedsN;
      if (timeline) body.timeline = timeline;
      if (propertyType) body.propertyTypes = [propertyType];
      if (financing) body.financingStatus = financing;
      const mh = mustHaves.split(",").map((s) => s.trim()).filter(Boolean);
      if (mh.length) body.mustHaves = mh;

      const res = await fetch(`/api/contacts/${contactId}/buyer-preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      setEditOpen(false);
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/buyer-preferences`] });
      onUpdated?.();
    },
  });

  const extractMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}/buyer-preferences/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Extract failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/contacts/${contactId}/buyer-preferences`] });
      onUpdated?.();
    },
  });

  if (!visible && !chips.length) return null;

  return (
    <div className="mt-3" data-testid="buyer-preferences-panel">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
          Buyer preferences
        </span>
        <div className="flex items-center gap-0.5">
          {eligible && (
            <>
              <button
                type="button"
                onClick={() => extractMutation.mutate()}
                disabled={extractMutation.isPending}
                className="p-0.5 text-gray-300 hover:text-gray-500 rounded"
                title="Refresh from conversation"
                data-testid="button-buyer-prefs-refresh"
              >
                {extractMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </button>
              <button
                type="button"
                onClick={openEdit}
                className="p-0.5 text-gray-300 hover:text-gray-500 rounded"
                title="Edit preferences"
                data-testid="button-buyer-prefs-edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {isLoading || isFetching ? (
        <p className="text-[11px] text-gray-400 italic">Loading…</p>
      ) : chips.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <ChipBadge key={chip.id} chip={chip} />
          ))}
        </div>
      ) : eligible ? (
        <p className="text-[11px] text-gray-400 italic leading-snug">
          Listening for areas, budget, and must-haves in this thread.
        </p>
      ) : null}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Edit buyer preferences</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div>
              <Label className="text-xs">Areas (comma-separated)</Label>
              <Input className="h-8 text-xs mt-1" value={areas} onChange={(e) => setAreas(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Budget max ($)</Label>
              <Input className="h-8 text-xs mt-1" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Beds min</Label>
                <Input className="h-8 text-xs mt-1" value={beds} onChange={(e) => setBeds(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Property type</Label>
                <Select value={propertyType || "_"} onValueChange={(v) => setPropertyType(v === "_" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">—</SelectItem>
                    <SelectItem value="condo">Condo</SelectItem>
                    <SelectItem value="house">House</SelectItem>
                    <SelectItem value="townhouse">Townhouse</SelectItem>
                    <SelectItem value="multi_family">Multi-family</SelectItem>
                    <SelectItem value="land">Land</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Timeline</Label>
                <Select value={timeline || "_"} onValueChange={(v) => setTimeline(v === "_" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">—</SelectItem>
                    <SelectItem value="asap">ASAP</SelectItem>
                    <SelectItem value="30d">30 days</SelectItem>
                    <SelectItem value="60_90d">60–90 days</SelectItem>
                    <SelectItem value="browsing">Browsing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Financing</Label>
                <Select value={financing || "_"} onValueChange={(v) => setFinancing(v === "_" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">—</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="pre_approved">Pre-approved</SelectItem>
                    <SelectItem value="exploring">Exploring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Must-haves (comma-separated)</Label>
              <Input className="h-8 text-xs mt-1" value={mustHaves} onChange={(e) => setMustHaves(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
