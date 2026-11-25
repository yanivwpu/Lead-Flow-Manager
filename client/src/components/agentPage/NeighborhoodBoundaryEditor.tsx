import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Ellipsis, Maximize2, Minimize2, Minus, Plus, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readCustomNeighborhoodBoundary } from "@shared/agent/neighborhoodCustomBoundary";
import type { PolygonBoundary, Position } from "@shared/agent/neighborhoodListingGeo";
import { readNeighborhoodMapSession, writeNeighborhoodMapSession } from "@/lib/neighborhoodMapSession";

const TILE = 256;
const MAP_HEIGHT = 340;
const MAX_ZOOM = 17;
const MIN_ZOOM = 2;
const RAD = Math.PI / 180;

type Center = { lat: number; lon: number };
type Pointer = { x: number; y: number };
type MapGesture = { origin: Center; zoom: number; start: Map<number, Pointer>; moved: boolean; pinching: boolean };
const DRAG_THRESHOLD = 5;
function project(lat: number, lon: number, zoom: number): [number, number] {
  const n = TILE * 2 ** zoom;
  const safe = Math.max(-85, Math.min(85, lat));
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(safe * RAD)) / Math.PI) / 2 * n];
}
function unproject(x: number, y: number, zoom: number): Center {
  const n = TILE * 2 ** zoom;
  return { lon: (x / n) * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) / RAD };
}
function initialCenter(boundary?: PolygonBoundary | null): Center {
  const ring = boundary?.coordinates[0];
  if (!ring?.length) return { lat: 0, lon: 0 };
  const positions = ring.slice(0, -1);
  return { lat: positions.reduce((s, p) => s + p[1], 0) / positions.length,
    lon: positions.reduce((s, p) => s + p[0], 0) / positions.length };
}

export function NeighborhoodBoundaryEditor({
  boundary, persistedBoundary, persistedVersion, name, city, state, country, sessionKey, disabled, stale, onChange,
}: {
  boundary?: PolygonBoundary | null;
  persistedBoundary: PolygonBoundary | null;
  persistedVersion: string | null;
  name: string;
  city: string;
  state: string;
  country: string;
  sessionKey: string;
  disabled: boolean;
  stale: boolean;
  onChange: (next: PolygonBoundary | null) => void;
}) {
  const { t } = useTranslation();
  const restored = useMemo(() => {
    try { return readNeighborhoodMapSession(window.sessionStorage, sessionKey); }
    catch { return null; }
  }, [sessionKey]);
  const boundaryKey = JSON.stringify(boundary ?? null);
  const persistedKey = JSON.stringify(persistedBoundary);
  const restoredCorners = restored?.boundaryKey === boundaryKey ? restored.vertices : null;
  const initial = useMemo(() => restored?.center ?? initialCenter(boundary), [sessionKey]);
  const [center, setCenter] = useState<Center>(initial);
  const [zoom, setZoom] = useState(restored?.zoom ?? (boundary ? 14 : 3));
  const [size, setSize] = useState({ width: 600, height: MAP_HEIGHT });
  const [vertices, setVertices] = useState<Position[]>(() =>
    restoredCorners ?? boundary?.coordinates[0]?.slice(0, -1) ?? []);
  const [latInput, setLatInput] = useState(String(initial.lat.toFixed(5)));
  const [lonInput, setLonInput] = useState(String(initial.lon.toFixed(5)));
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const [open, setOpen] = useState(restored?.open ?? false);
  const [expanded, setExpanded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [removal, setRemoval] = useState(restored?.boundaryKey === boundaryKey ? restored.removal : undefined);
  const rememberedRemoval = !boundary && removal?.version === persistedVersion ? removal : undefined;
  const restoreBoundary = !boundary ? rememberedRemoval?.boundary ?? persistedBoundary : null;
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const expandRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, Pointer>());
  const gestureRef = useRef<MapGesture | null>(null);
  const lastWheelRef = useRef(0);

  useEffect(() => {
    const element = mapRef.current;
    if (!open || !element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [open]);

  function moveTo(next: Center, nextZoom = zoom) {
    setCenter(next);
    setZoom(nextZoom);
    setLatInput(next.lat.toFixed(5));
    setLonInput(next.lon.toFixed(5));
  }

  // Preserve the location under the cursor when zooming, as on standard maps.
  function zoomAt(nextZoom: number, clientX: number, clientY: number) {
    const element = mapRef.current;
    if (!element) return;
    const level = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    if (level === zoom) return;
    const rect = element.getBoundingClientRect();
    const dx = clientX - rect.left - rect.width / 2;
    const dy = clientY - rect.top - rect.height / 2;
    const [cx, cy] = project(center.lat, center.lon, zoom);
    const focus = unproject(cx + dx, cy + dy, zoom);
    const [fx, fy] = project(focus.lat, focus.lon, level);
    moveTo(unproject(fx - dx, fy - dy, level), level);
  }

  // React's delegated wheel listeners can be passive in some browsers.
  // Use an explicit non-passive listener so wheel zoom never scrolls the page.
  useEffect(() => {
    const element = mapRef.current;
    if (!open || !element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (Math.abs(event.deltaY) < 0.01) return;
      const now = performance.now();
      if (now - lastWheelRef.current < 120) return;
      lastWheelRef.current = now;
      zoomAt(zoom + (event.deltaY < 0 ? 1 : -1), event.clientX, event.clientY);
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [open, center, zoom]);

  // Map navigation survives switching dashboard pages or browser tabs.
  // These are local view/corner drafts only; MLS geometry is never changed until
  // the agent explicitly applies the area and saves the neighborhood page.
  useEffect(() => {
    try {
      writeNeighborhoodMapSession(window.sessionStorage, sessionKey, {
        open, center, zoom, vertices, boundaryKey, removal: rememberedRemoval,
      });
    } catch { /* storage may be blocked in private browsing */ }
  }, [sessionKey, open, center, zoom, vertices, boundaryKey, rememberedRemoval]);

  useEffect(() => {
    if (!expanded) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keepFocusInPanel = (event: FocusEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) expandRef.current?.focus();
    };
    if (!panelRef.current?.contains(document.activeElement)) expandRef.current?.focus();
    document.addEventListener("focusin", keepFocusInPanel);
    return () => {
      document.removeEventListener("focusin", keepFocusInPanel);
      document.body.style.overflow = previous;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (moreOpen) {
        setMoreOpen(false);
        moreRef.current?.focus();
      } else {
        setExpanded(false);
        expandRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expanded, moreOpen]);

  // The parent can restore a saved page on Discard, or receive a newer save
  // from another browser tab. Do not leave stale, uncommitted map vertices
  // visible after its boundary prop changes.
  const previousBoundaryKey = useRef(boundaryKey);
  const locallyAppliedBoundary = useRef<string | null>(null);
  useEffect(() => {
    // Initial mount has already restored the page-specific session. Do not
    // erase pending corners when the editor is reopened after tab navigation.
    if (previousBoundaryKey.current === boundaryKey) return;
    previousBoundaryKey.current = boundaryKey;
    const saved = JSON.parse(boundaryKey) as PolygonBoundary | null;
    setVertices(saved?.coordinates[0]?.slice(0, -1) ?? []);
    if (locallyAppliedBoundary.current !== boundaryKey) {
      if (saved) moveTo(initialCenter(saved), 14);
      setRemoval(undefined);
      setStatus("");
    }
    locallyAppliedBoundary.current = null;
  }, [boundaryKey]);

  async function locate() {
    if (!name.trim() || !city.trim() || !state.trim() || !/^[a-zA-Z]{2}$/.test(country)) {
      setStatus(t("rgeMap.enterLocation"));
      return;
    }
    setLocating(true);
    setStatus("");
    try {
      const query = new URLSearchParams({ name, city, state, country });
      const response = await fetch(`/api/agent-page/neighborhoods/map-center?${query.toString()}`, { credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        throw new Error(result.error || t("rgeMap.locationUnavailable"));
      }
      moveTo({ lat: result.latitude, lon: result.longitude }, 14);
      setOpen(true);
      setStatus(result.precision === "city" ? t("rgeMap.locatedApproximate") : t("rgeMap.located"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("rgeMap.locationFailed"));
    } finally { setLocating(false); }
  }

  const shape: PolygonBoundary | null = vertices.length >= 3
    ? { type: "Polygon", coordinates: [[...vertices, vertices[0]]] } : null;
  const safeShape = shape && readCustomNeighborhoodBoundary(shape);
  const formVertices = boundary?.coordinates[0]?.slice(0, -1) ?? [];
  const drawingChanged = JSON.stringify(vertices) !== JSON.stringify(formVertices);
  const boundaryChanged = boundaryKey !== persistedKey;
  const boundaryLabel = stale ? t("rgeMap.stale")
    : boundaryChanged ? (boundary ? t("rgeMap.applied") : t("rgeMap.removalPending"))
    : boundary ? t("rgeMap.saved") : rememberedRemoval ? t("rgeMap.removed") : t("rgeMap.optional");
  const outlineLabel = drawingChanged && !stale
    ? [t("rgeMap.unapplied"), boundaryChanged ? boundaryLabel : ""].filter(Boolean).join(" · ")
    : boundaryLabel;

  function applyBoundary(next: PolygonBoundary | null) {
    locallyAppliedBoundary.current = JSON.stringify(next);
    onChange(next);
    setVertices(next?.coordinates[0]?.slice(0, -1) ?? []);
    setStatus("");
  }

  function centerManually() {
    const lat = latInput.trim() ? Number(latInput) : NaN;
    const lon = lonInput.trim() ? Number(lonInput) : NaN;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
      setStatus(t("rgeMap.coordsInvalid"));
      return;
    }
    moveTo({ lat, lon }, 14);
    setStatus("");
  }

  function onPanelKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && moreOpen && !expanded) {
      event.stopPropagation();
      setMoreOpen(false);
      moreRef.current?.focus();
    } else if (event.key === "Tab" && expanded) {
      const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]',
      )).filter((element) => !element.closest("[hidden]"));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey ? event.target === first : event.target === last) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  }

  const [centerX, centerY] = project(center.lat, center.lon, zoom);
  const tiles: Array<{ id: string; left: number; top: number; url: string }> = [];
  const maxTile = 2 ** zoom;
  for (let x = Math.floor((centerX - size.width / 2) / TILE);
    x <= Math.floor((centerX + size.width / 2) / TILE); x++) {
    for (let y = Math.floor((centerY - size.height / 2) / TILE);
      y <= Math.floor((centerY + size.height / 2) / TILE); y++) {
      if (y < 0 || y >= maxTile) continue;
      const wrapped = ((x % maxTile) + maxTile) % maxTile;
      tiles.push({ id: `${zoom}/${x}/${y}`, left: x * TILE - centerX + size.width / 2,
        top: y * TILE - centerY + size.height / 2,
        url: `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png` });
    }
  }
  const points = vertices.map(([lon, lat]) => {
    const [x, y] = project(lat, lon, zoom);
    return [x - centerX + size.width / 2, y - centerY + size.height / 2];
  });
  const polygonPoints = points.map((p) => p.join(",")).join(" ");

  function addCornerAt(clientX: number, clientY: number, element: SVGSVGElement) {
    if (disabled || zoom < 10) {
      setStatus(zoom < 10 ? t("rgeMap.zoomRequired") : t("rgeMap.editUnavailable"));
      return;
    }
    if (vertices.length >= 128) { setStatus(t("rgeMap.tooMany")); return; }
    const rect = element.getBoundingClientRect();
    const x = centerX + clientX - rect.left - rect.width / 2;
    const y = centerY + clientY - rect.top - rect.height / 2;
    const p = unproject(x, y, zoom);
    if (p.lon < -180 || p.lon > 180) return;
    setVertices((prior) => [...prior, [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))]]);
    setStatus("");
  }

  function pan(dx: number, dy: number) {
    const point = unproject(centerX + dx, centerY + dy, zoom);
    moveTo(point);
  }

  function onMapPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const pointers = pointersRef.current;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    event.currentTarget.setPointerCapture(event.pointerId);
    // A second finger begins a pinch rather than placing a map corner.
    gestureRef.current = {
      origin: center, zoom, start: new Map(pointers),
      moved: pointers.size > 1, pinching: pointers.size > 1,
    };
  }

  function onMapPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = gestureRef.current;
    if (!gesture) return;
    const [sx, sy] = project(gesture.origin.lat, gesture.origin.lon, gesture.zoom);
    if (pointers.size === 1 && gesture.start.size === 1) {
      const started = gesture.start.get(event.pointerId);
      if (!started) return;
      const dx = event.clientX - started.x, dy = event.clientY - started.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD && !gesture.moved) return;
      gesture.moved = true;
      setDragging(true);
      moveTo(unproject(sx - dx, sy - dy, gesture.zoom), gesture.zoom);
      return;
    }
    if (pointers.size !== 2 || gesture.start.size !== 2) return;
    const [a, b] = Array.from(gesture.start.values());
    const [c, d] = Array.from(pointers.values());
    const startDistance = Math.hypot(a.x - b.x, a.y - b.y);
    const distance = Math.hypot(c.x - d.x, c.y - d.y);
    if (startDistance < 10 || distance < 1) return;
    gesture.moved = true;
    gesture.pinching = true;
    setDragging(true);
    const level = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      Math.round(gesture.zoom + Math.log2(distance / startDistance))));
    const rect = event.currentTarget.getBoundingClientRect();
    const startDx = (a.x + b.x) / 2 - rect.left - rect.width / 2;
    const startDy = (a.y + b.y) / 2 - rect.top - rect.height / 2;
    const focus = unproject(sx + startDx, sy + startDy, gesture.zoom);
    const [fx, fy] = project(focus.lat, focus.lon, level);
    const nextDx = (c.x + d.x) / 2 - rect.left - rect.width / 2;
    const nextDy = (c.y + d.y) / 2 - rect.top - rect.height / 2;
    moveTo(unproject(fx - nextDx, fy - nextDy, level), level);
  }

  function finishPointer(event: React.PointerEvent<SVGSVGElement>, cancelled = false) {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    const gesture = gestureRef.current;
    const addCorner = !cancelled && pointers.size === 1 &&
      gesture?.start.size === 1 && !gesture.moved && !gesture.pinching;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointers.delete(event.pointerId);
    if (pointers.size) {
      // Continue panning smoothly with the finger that remains after a pinch.
      gestureRef.current = { origin: center, zoom, start: new Map(pointers), moved: true, pinching: true };
    } else {
      gestureRef.current = null;
      setDragging(false);
    }
    if (addCorner) addCornerAt(event.clientX, event.clientY, event.currentTarget);
  }

  function onMapKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowUp: [0, -120], ArrowDown: [0, 120],
      ArrowLeft: [-120, 0], ArrowRight: [120, 0],
    };
    if (directions[event.key]) {
      event.preventDefault();
      pan(...directions[event.key]);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      const rect = mapRef.current?.getBoundingClientRect();
      if (rect) zoomAt(zoom + 1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      const rect = mapRef.current?.getBoundingClientRect();
      if (rect) zoomAt(zoom - 1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }
  }

  return (
    <section className="rge-custom-map-section rounded-lg border border-slate-200 bg-white p-3"
      data-rge-custom-map="true">
      <button type="button" data-rge-map-toggle="true"
        aria-expanded={open} aria-controls={open ? panelId : undefined}
        className="flex w-full items-center gap-2 text-start text-sm font-semibold text-slate-800"
        onClick={() => { setOpen((wasOpen) => !wasOpen); setExpanded(false); setMoreOpen(false); }}>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          aria-hidden="true" />
        <span>{t("rgeMap.title")} · {boundaryLabel}</span>
      </button>
      {open && <>
        {expanded && <div className="fixed inset-0 z-[79] bg-slate-950/65" aria-hidden="true" />}
        <div id={panelId} ref={panelRef} data-rge-map-panel="true"
          role={expanded ? "dialog" : undefined} aria-modal={expanded || undefined}
          aria-label={t("rgeMap.title")} onKeyDown={onPanelKeyDown}
          className={expanded
            ? "fixed inset-2 z-[80] flex flex-col overflow-hidden rounded-xl border bg-white shadow-2xl sm:inset-4"
            : "relative mt-3 overflow-hidden rounded-md border bg-white"}>
          <div className="max-h-[50dvh] shrink-0 overflow-y-auto border-b border-slate-200 p-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("rgeMap.drawingControls")}>
              <Button type="button" size="sm" variant="outline" disabled={disabled || locating}
                onClick={() => void locate()}>{locating ? t("rgeMap.locating") : t("rgeMap.find")}</Button>
              <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0"
                aria-label={t("rgeMap.undo")} title={t("rgeMap.undo")} disabled={disabled || !vertices.length}
                onClick={() => {
                  setVertices((prior) => prior.slice(0, -1));
                  setStatus("");
                  if (vertices.length === 1) moreRef.current?.focus();
                }}>
                <Undo2 className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" disabled={disabled || !safeShape || !drawingChanged}
                onClick={() => {
                  if (!safeShape) return;
                  setRemoval(undefined);
                  applyBoundary(safeShape);
                  moreRef.current?.focus();
                }}>
                {t("rgeMap.apply")}
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-9 w-9 p-0" ref={moreRef}
                aria-label={t("rgeMap.more")} title={t("rgeMap.more")} aria-expanded={moreOpen}
                aria-controls={`${panelId}-more`} onClick={() => setMoreOpen(!moreOpen)}>
                <Ellipsis className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div id={`${panelId}-more`} hidden={!moreOpen} className="mt-2 space-y-2 rounded-md border p-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={disabled || !vertices.length}
                  onClick={() => { setVertices([]); setStatus(""); moreRef.current?.focus(); }}>{t("rgeMap.restart")}</Button>
                <Button type="button" size="sm" variant="outline" disabled={disabled || !drawingChanged}
                  onClick={() => { setVertices(formVertices); setStatus(""); moreRef.current?.focus(); }}>{t("rgeMap.reset")}</Button>
                {boundary && <Button type="button" size="sm" variant="outline" disabled={disabled}
                  className="text-destructive" onClick={() => {
                    if (!window.confirm(t("rgeMap.confirmRemove"))) return;
                    setRemoval({ boundary, version: persistedVersion });
                    applyBoundary(null);
                    moreRef.current?.focus();
                  }}>{t("rgeMap.remove")}</Button>}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-xs">{t("rgeMap.latitude")}
                  <Input className="w-28" dir="ltr" inputMode="decimal" value={latInput} onChange={(e) => setLatInput(e.target.value)} disabled={disabled} />
                </label>
                <label className="space-y-1 text-xs">{t("rgeMap.longitude")}
                  <Input className="w-28" dir="ltr" inputMode="decimal" value={lonInput} onChange={(e) => setLonInput(e.target.value)} disabled={disabled} />
                </label>
                <Button type="button" size="sm" variant="outline" disabled={disabled}
                  onClick={centerManually}>{t("rgeMap.center")}</Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-600">{t("rgeMap.gestureHelp")}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
              <span>{t("rgeMap.corners", { count: vertices.length, zoom })}</span>
              <span role="status" data-rge-boundary-status="true" className="font-medium">
                {outlineLabel}
              </span>
              {restoreBoundary && <Button type="button" size="sm" variant="ghost" className="h-8" disabled={disabled}
                onClick={() => {
                  setRemoval(undefined);
                  applyBoundary(restoreBoundary);
                  moreRef.current?.focus();
                }}>{t("rgeMap.undoRemoval")}</Button>}
            </div>
            {status && <p role="status" className="mt-1 text-sm text-slate-700">{status}</p>}
            {shape && !safeShape && <p role="alert" className="mt-1 text-xs text-amber-700">{t("rgeMap.invalid")}</p>}
          </div>
          <div ref={mapRef} className="relative min-h-0 w-full flex-1 overflow-hidden bg-slate-100"
            style={expanded ? undefined : { height: MAP_HEIGHT }} aria-label={t("rgeMap.map")}>
            {tiles.map((tile) => <img key={tile.id} alt="" src={tile.url} width={TILE} height={TILE}
              decoding="async" referrerPolicy="strict-origin-when-cross-origin" draggable={false}
              style={{ position: "absolute", width: TILE, height: TILE, left: tile.left, top: tile.top, maxWidth: "none", pointerEvents: "none" }} />)}
            <svg width="100%" height="100%" className="absolute inset-0 cursor-crosshair"
              role="application" aria-label={t("rgeMap.clickCorners")} tabIndex={0}
              style={{ touchAction: "none", cursor: dragging ? "grabbing" : "crosshair" }}
              onPointerDown={onMapPointerDown} onPointerMove={onMapPointerMove}
              onPointerUp={(event) => finishPointer(event)}
              onPointerCancel={(event) => finishPointer(event, true)}
              onKeyDown={onMapKeyDown}>
              {points.length >= 3 && <polygon points={polygonPoints} fill="rgba(16,185,129,.16)" stroke="#047857" strokeWidth={2}/>}
              {points.length === 2 && <polyline points={polygonPoints} fill="none" stroke="#047857" strokeWidth={2}/>}
              {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill="#047857" stroke="white" strokeWidth={2}/>)}
            </svg>
            <div className="absolute end-3 top-3 z-20 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/95 p-1 shadow-sm"
              role="group" aria-label={t("rgeMap.mapControls")}>
              <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
                aria-label={t("rgeMap.zoomIn")} title={t("rgeMap.zoomIn")}
                onClick={() => { const r = mapRef.current?.getBoundingClientRect();
                  if (r) zoomAt(zoom + 1, r.left + r.width / 2, r.top + r.height / 2); }}>
                <Plus className="h-5 w-5" aria-hidden="true" />
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
                aria-label={t("rgeMap.zoomOut")} title={t("rgeMap.zoomOut")}
                onClick={() => { const r = mapRef.current?.getBoundingClientRect();
                  if (r) zoomAt(zoom - 1, r.left + r.width / 2, r.top + r.height / 2); }}>
                <Minus className="h-5 w-5" aria-hidden="true" />
              </Button>
              <div className="border-t border-slate-200" />
              <Button type="button" size="sm" variant="ghost" className="h-9 w-9 p-0"
                ref={expandRef} aria-label={expanded ? t("rgeMap.collapse") : t("rgeMap.expand")}
                title={expanded ? t("rgeMap.collapse") : t("rgeMap.expand")}
                onClick={() => setExpanded((value) => !value)}>
                {expanded ? <Minimize2 className="h-5 w-5" aria-hidden="true" />
                  : <Maximize2 className="h-5 w-5" aria-hidden="true" />}
              </Button>
            </div>
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
              className="absolute bottom-1 end-1 rounded bg-white/90 px-1 text-[10px] text-slate-800">
              {t("rgeMap.attribution")}
            </a>
          </div>
        </div>
      </>}
    </section>
  );
}
