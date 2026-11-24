import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readCustomNeighborhoodBoundary } from "@shared/agent/neighborhoodCustomBoundary";
import type { PolygonBoundary, Position } from "@shared/agent/neighborhoodListingGeo";

const TILE = 256;
const MAP_HEIGHT = 340;
const MAX_ZOOM = 17;
const MIN_ZOOM = 2;
const RAD = Math.PI / 180;

type Center = { lat: number; lon: number };
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
  boundary, name, city, state, country, disabled, onChange,
}: {
  boundary?: PolygonBoundary | null;
  name: string;
  city: string;
  state: string;
  country: string;
  disabled: boolean;
  onChange: (next: PolygonBoundary | null) => void;
}) {
  const { t } = useTranslation();
  const initial = useMemo(() => initialCenter(boundary), []);
  const [center, setCenter] = useState<Center>(initial);
  const [zoom, setZoom] = useState(boundary ? 14 : 3);
  const [size, setSize] = useState({ width: 600, height: MAP_HEIGHT });
  const [vertices, setVertices] = useState<Position[]>(() => boundary?.coordinates[0]?.slice(0, -1) ?? []);
  const [latInput, setLatInput] = useState(String(initial.lat.toFixed(5)));
  const [lonInput, setLonInput] = useState(String(initial.lon.toFixed(5)));
  const [status, setStatus] = useState("");
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = mapRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSize({ width: entry.contentRect.width, height: MAP_HEIGHT });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function moveTo(next: Center, nextZoom = zoom) {
    setCenter(next);
    setZoom(nextZoom);
    setLatInput(next.lat.toFixed(5));
    setLonInput(next.lon.toFixed(5));
  }

  // The parent can restore a saved page on Discard, or receive a newer save
  // from another browser tab. Do not leave stale, uncommitted map vertices
  // visible after its boundary prop changes.
  const boundaryKey = JSON.stringify(boundary ?? null);
  const locallyAppliedBoundary = useRef<string | null>(null);
  useEffect(() => {
    const saved = JSON.parse(boundaryKey) as PolygonBoundary | null;
    setVertices(saved?.coordinates[0]?.slice(0, -1) ?? []);
    if (saved) moveTo(initialCenter(saved), 14);
    // Preserve the "Apply" / "Remove" confirmation only for our own action.
    if (locallyAppliedBoundary.current === boundaryKey) {
      locallyAppliedBoundary.current = null;
    } else {
      setStatus("");
    }
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
      setStatus(t("rgeMap.located"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("rgeMap.locationFailed"));
    } finally { setLocating(false); }
  }

  const shape: PolygonBoundary | null = vertices.length >= 3
    ? { type: "Polygon", coordinates: [[...vertices, vertices[0]]] } : null;
  const safeShape = shape && readCustomNeighborhoodBoundary(shape);
  const pending = JSON.stringify(shape) !== JSON.stringify(boundary ?? null);
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

  function addPoint(event: React.MouseEvent<SVGSVGElement>) {
    if (disabled || zoom < 10) {
      setStatus(zoom < 10 ? t("rgeMap.zoomRequired") : t("rgeMap.editUnavailable"));
      return;
    }
    if (vertices.length >= 128) { setStatus(t("rgeMap.tooMany")); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = centerX + event.clientX - rect.left - rect.width / 2;
    const y = centerY + event.clientY - rect.top - rect.height / 2;
    const p = unproject(x, y, zoom);
    if (p.lon < -180 || p.lon > 180) return;
    setVertices((prior) => [...prior, [Number(p.lon.toFixed(7)), Number(p.lat.toFixed(7))]]);
    setStatus("");
  }

  function pan(dx: number, dy: number) {
    const point = unproject(centerX + dx, centerY + dy, zoom);
    moveTo(point);
  }

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
        {t("rgeMap.title")} · {boundary ? t("rgeMap.saved") : t("rgeMap.optional")}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          {t("rgeMap.instructions")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || locating}
            onClick={() => void locate()}>{locating ? t("rgeMap.locating") : t("rgeMap.find")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}>{t("rgeMap.zoomIn")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}>{t("rgeMap.zoomOut")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(0, -120)} aria-label={t("rgeMap.north")}>↑</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(0, 120)} aria-label={t("rgeMap.south")}>↓</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(-120, 0)} aria-label={t("rgeMap.west")}>←</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(120, 0)} aria-label={t("rgeMap.east")}>→</Button>
        </div>
        <div ref={mapRef} className="relative w-full overflow-hidden rounded-md border bg-slate-100"
          style={{ height: MAP_HEIGHT }} aria-label={t("rgeMap.map")}>
          {tiles.map((tile) => <img key={tile.id} alt="" src={tile.url} width={TILE} height={TILE}
            decoding="async" referrerPolicy="strict-origin-when-cross-origin" draggable={false}
            style={{ position: "absolute", width: TILE, height: TILE, left: tile.left, top: tile.top, maxWidth: "none", pointerEvents: "none" }} />)}
          <svg width="100%" height="100%" className="absolute inset-0 cursor-crosshair"
            role="img" aria-label={t("rgeMap.clickCorners")} onClick={addPoint}>
            {points.length >= 3 && <polygon points={polygonPoints} fill="rgba(16,185,129,.16)" stroke="#047857" strokeWidth={2}/>}
            {points.length === 2 && <polyline points={polygonPoints} fill="none" stroke="#047857" strokeWidth={2}/>}
            {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill="#047857" stroke="white" strokeWidth={2}/>)}
          </svg>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
            className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-slate-800">
            {t("rgeMap.attribution")}
          </a>
        </div>
        <p className="text-xs text-slate-500">
          {t("rgeMap.corners", { count: vertices.length, zoom })}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">{t("rgeMap.latitude")}
            <Input className="w-32" inputMode="decimal" value={latInput} onChange={(e) => setLatInput(e.target.value)} disabled={disabled} />
          </label>
          <label className="space-y-1 text-xs">{t("rgeMap.longitude")}
            <Input className="w-32" inputMode="decimal" value={lonInput} onChange={(e) => setLonInput(e.target.value)} disabled={disabled} />
          </label>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
            const lat = Number(latInput), lon = Number(lonInput);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
              setStatus(t("rgeMap.coordsInvalid")); return;
            }
            moveTo({ lat, lon }, 14);
          }}>{t("rgeMap.center")}</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || vertices.length === 0}
            onClick={() => { setVertices((p) => p.slice(0, -1)); setStatus(""); }}>{t("rgeMap.undo")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || vertices.length === 0}
            onClick={() => { setVertices([]); setStatus(""); }}>{t("rgeMap.restart")}</Button>
          <Button type="button" size="sm" disabled={disabled || !safeShape || !pending}
            onClick={() => { locallyAppliedBoundary.current = JSON.stringify(safeShape!);
              onChange(safeShape!); setStatus(t("rgeMap.applied")); }}>
            {t("rgeMap.apply")}
          </Button>
          {boundary && <Button type="button" size="sm" variant="outline" disabled={disabled}
            onClick={() => { locallyAppliedBoundary.current = "null";
              onChange(null); setVertices([]); setStatus(t("rgeMap.removed")); }}>
            {t("rgeMap.remove")}
          </Button>}
        </div>
        {shape && !safeShape && <p role="alert" className="text-xs text-amber-700">
          {t("rgeMap.invalid")}
        </p>}
        {status && <p role="status" className="text-xs text-slate-700">{status}</p>}
      </div>
    </details>
  );
}
