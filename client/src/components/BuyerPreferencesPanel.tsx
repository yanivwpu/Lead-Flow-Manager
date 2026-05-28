import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Raw profile from contact row (optional seed until API loads). */
  initialProfile?: unknown;
  onUpdated?: () => void;
  /** Tighter layout when nested under Copilot. */
  compact?: boolean;
  /** When true, hide refresh/edit controls (chips only). */
  readOnly?: boolean;
}

type BuyerPreferencesApiResponse = {
  eligible?: boolean;
  reason?: string;
  profile?: unknown;
  rawProfile?: unknown;
  chips?: BuyerPreferenceChip[];
};

function chipsFromRaw(raw: unknown): BuyerPreferenceChip[] {
  return buildBuyerPreferenceChips(raw);
}

function ChipBadge({ chip, valueOnly }: { chip: BuyerPreferenceChip; valueOnly?: boolean }) {
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
      {valueOnly ? (
        <span className="truncate">{chip.value}</span>
      ) : (
        <>
          <span className="text-gray-500 shrink-0">{chip.label}:</span>
          <span className="truncate">{chip.value}</span>
        </>
      )}
    </span>
  );
}

export function BuyerPreferencesPanel({
  contactId,
  initialProfile,
  onUpdated,
  compact = false,
  readOnly = false,
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

  const stickyChipsRef = useRef<BuyerPreferenceChip[]>([]);
  const prevContactIdRef = useRef(contactId);
  if (prevContactIdRef.current !== contactId) {
    prevContactIdRef.current = contactId;
    stickyChipsRef.current = [];
  }

  const { data, isLoading, isFetched } = useQuery<BuyerPreferencesApiResponse>({
    queryKey: [`/api/contacts/${contactId}/buyer-preferences`],
    enabled: !!contactId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Reset sticky cache when switching contacts
  useEffect(() => {
    stickyChipsRef.current = [];
  }, [contactId]);

  const apiRaw = data?.rawProfile ?? data?.profile;
  const rawForDisplay = apiRaw ?? initialProfile;

  const resolvedChips = useMemo(() => {
    if (data?.chips && data.chips.length > 0) return data.chips;
    if (apiRaw != null) return chipsFromRaw(apiRaw);
    if (initialProfile != null) return chipsFromRaw(initialProfile);
    return [];
  }, [data?.chips, apiRaw, initialProfile]);

  // Temporary debug logs (enable via window.__debugBuyerPrefs = true)
  useEffect(() => {
    const enabled = typeof window !== "undefined" && (window as any).__debugBuyerPrefs;
    if (!enabled) return;
    const initialChips = initialProfile != null ? chipsFromRaw(initialProfile) : [];
    console.log("[BuyerPreferencePanel] mounted", { contactId });
    console.log("[BuyerPreferencePanel] initialProfile/chips", {
      contactId,
      hasInitialProfile: initialProfile != null,
      initialChipCount: initialChips.length,
      initialChipValues: initialChips.map((c) => c.value).slice(0, 12),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  useEffect(() => {
    const enabled = typeof window !== "undefined" && (window as any).__debugBuyerPrefs;
    if (!enabled) return;
    if (!isFetched) return;
    console.log("[BuyerPreferencePanel] apiResponse/chips/eligible", {
      contactId,
      eligible: data?.eligible,
      reason: data?.reason,
      apiChipCount: data?.chips?.length ?? 0,
      resolvedChipCount: resolvedChips.length,
      resolvedChipValues: resolvedChips.map((c) => c.value).slice(0, 12),
      hasRawProfile: data?.rawProfile != null,
      profileStatus:
        data?.profile && typeof data.profile === "object"
          ? (data.profile as any).profileStatus
          : undefined,
    });
  }, [contactId, isFetched, data, resolvedChips]);

  useEffect(() => {
    if (resolvedChips.length > 0) {
      stickyChipsRef.current = resolvedChips;
    }
  }, [resolvedChips]);

  const displayChips =
    resolvedChips.length > 0 ? resolvedChips : stickyChipsRef.current;

  const eligible = data?.eligible ?? false;

  const profileForEdit = rawForDisplay;

  const showDebugUi = useMemo(() => {
    if (import.meta.env.DEV) return true;
    if (typeof window === "undefined") return false;
    try {
      return new URLSearchParams(window.location.search).get("debugBuyerPrefs") === "1";
    } catch {
      return false;
    }
  }, []);

  const debug = useMemo(() => {
    const source = isFetched ? "api" : initialProfile != null ? "initial" : "none";
    const profileObj =
      apiRaw && typeof apiRaw === "object"
        ? (apiRaw as Record<string, unknown>)
        : initialProfile && typeof initialProfile === "object"
          ? (initialProfile as Record<string, unknown>)
          : null;
    const profileKeys = profileObj ? Object.keys(profileObj).length : 0;
    const chipCount = displayChips.length;
    const apiReturned = isFetched && data != null;
    return { source, profileKeys, chipCount, apiReturned };
  }, [apiRaw, initialProfile, isFetched, data, displayChips.length]);

  useEffect(() => {
    if (import.meta.env.DEV && isFetched && data) {
      console.debug("[BuyerPrefs:panel]", {
        contactId,
        eligible: data.eligible,
        reason: data.reason,
        apiChipCount: data.chips?.length ?? 0,
        resolvedChipCount: resolvedChips.length,
        displayChipCount: displayChips.length,
        hasInitialProfile: initialProfile != null,
        hasRawProfile: data.rawProfile != null,
        profileStatus:
          data.profile && typeof data.profile === "object"
            ? (data.profile as { profileStatus?: string }).profileStatus
            : undefined,
      });
    }
  }, [contactId, isFetched, data, resolvedChips.length, displayChips.length, initialProfile]);

  const openEdit = useCallback(() => {
    const p = profileForEdit as Record<string, { value?: unknown }> | undefined;
    setAreas((p?.targetAreas?.value as string[] | undefined)?.join(", ") || "");
    setBudgetMax(p?.priceMax?.value != null ? String(p.priceMax.value) : "");
    setBeds(p?.bedsMin?.value != null ? String(p.bedsMin.value) : "");
    setTimeline((p?.timeline?.value as string) || "");
    setPropertyType((p?.propertyTypes?.value as string[] | undefined)?.[0] || "");
    setFinancing((p?.financingStatus?.value as string) || "");
    setMustHaves((p?.mustHaves?.value as string[] | undefined)?.join(", ") || "");
    setEditOpen(true);
  }, [profileForEdit]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/contacts", contactId] });
      onUpdated?.();
    },
  });

  const hasKnownChips = displayChips.length > 0;
  const showEligible = isFetched ? eligible : hasKnownChips;
  const showControls = !readOnly && !compact;

  if (isFetched && !eligible && !hasKnownChips) return null;
  if (!contactId) return null;

  const showListening = isFetched && showEligible && !hasKnownChips && !isLoading;

  return (
    <div
      className={cn(compact ? "mt-0" : "mt-3")}
      data-testid="buyer-preferences-panel"
    >
      <div className={cn("flex items-center justify-between", compact ? "mb-0.5" : "mb-1")}>
        <span
          className={cn(
            "font-semibold uppercase tracking-wide",
            compact
              ? "text-[9px] text-violet-600/90"
              : "text-[10px] text-gray-400",
          )}
        >
          Buyer preferences
        </span>
        <div className="flex items-center gap-0.5">
          {showControls && showEligible && (
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

      {isLoading && !hasKnownChips ? (
        <p className={cn("text-gray-400 italic", compact ? "text-[10px]" : "text-[11px]")}>Loading…</p>
      ) : hasKnownChips ? (
        <div
          className={cn("flex flex-wrap", compact ? "gap-0.5" : "gap-1")}
          data-testid="buyer-preferences-chips"
        >
          {displayChips.map((chip) => (
            <ChipBadge key={chip.id} chip={chip} valueOnly={compact} />
          ))}
        </div>
      ) : showListening ? (
        <p className={cn("text-gray-400 italic leading-snug", compact ? "text-[10px]" : "text-[11px]")}>
          Listening for areas, budget, and must-haves in this thread.
        </p>
      ) : !isFetched ? (
        <p className={cn("text-gray-400 italic", compact ? "text-[10px]" : "text-[11px]")}>Loading…</p>
      ) : null}

      {showDebugUi && (
        <div className={cn("mt-1.5 text-[10px] text-gray-400 font-mono", compact && "text-[9px]")}>
          <div>eligible: {String(eligible)}</div>
          <div>chipCount: {debug.chipCount}</div>
          <div>profileKeys: {debug.profileKeys}</div>
          <div>source: {debug.source}</div>
          <div>apiReturned: {String(debug.apiReturned)}</div>
          <div>initialProfile: {String(initialProfile != null)}</div>
        </div>
      )}

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
