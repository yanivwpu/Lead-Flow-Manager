import { useEffect, useMemo, useRef, useState } from "react";
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

  async function locate() {
    if (!name.trim() || !city.trim() || !state.trim() || !/^[a-zA-Z]{2}$/.test(country)) {
      setStatus("Enter neighborhood, city, region and country before locating the map.");
      return;
    }
    setLocating(true);
    setStatus("");
    try {
      const query = new URLSearchParams({ name, city, state, country });
      const response = await fetch(`/api/agent-page/neighborhoods/map-center?${query.toString()}`, { credentials: "include" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) {
        throw new Error(result.error || "Location unavailable");
      }
      moveTo({ lat: result.latitude, lon: result.longitude }, 14);
      setStatus("Location found. Click the map to outline the area; review the streets before applying.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Map location failed");
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
      setStatus(zoom < 10 ? "Zoom in before outlining a neighborhood." : "Editing unavailable.");
      return;
    }
    if (vertices.length >= 128) { setStatus("The map area has too many corners."); return; }
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
        Custom neighborhood map {boundary ? "· Agent-defined area saved" : "· Optional"}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-slate-600">
          Use a custom area only when the official neighborhood map is missing or needs a different service area.
          Locate your neighborhood, click its corners on the map, then apply the shape and save the page.
          The public page will label it as an agent-defined area.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || locating}
            onClick={() => void locate()}>{locating ? "Locating…" : "Find neighborhood on map"}</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}>Zoom +</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}>Zoom −</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(0, -120)} aria-label="Move map north">↑</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(0, 120)} aria-label="Move map south">↓</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(-120, 0)} aria-label="Move map west">←</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => pan(120, 0)} aria-label="Move map east">→</Button>
        </div>
        <div ref={mapRef} className="relative w-full overflow-hidden rounded-md border bg-slate-100"
          style={{ height: MAP_HEIGHT }} aria-label="Neighborhood boundary map">
          {tiles.map((tile) => <img key={tile.id} alt="" src={tile.url} width={TILE} height={TILE}
            decoding="async" referrerPolicy="strict-origin-when-cross-origin" draggable={false}
            style={{ position: "absolute", width: TILE, height: TILE, left: tile.left, top: tile.top, maxWidth: "none" }} />)}
          <svg width="100%" height="100%" className="absolute inset-0 cursor-crosshair"
            role="img" aria-label="Click to place corners of your custom neighborhood" onClick={addPoint}>
            {points.length >= 3 && <polygon points={polygonPoints} fill="rgba(16,185,129,.16)" stroke="#047857" strokeWidth={2}/>}
            {points.length === 2 && <polyline points={polygonPoints} fill="none" stroke="#047857" strokeWidth={2}/>}
            {points.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5} fill="#047857" stroke="white" strokeWidth={2}/>)}
          </svg>
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer"
            className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-slate-800">
            © OpenStreetMap contributors
          </a>
        </div>
        <p className="text-xs text-slate-500">
          Zoom level {zoom}. {vertices.length} corner{vertices.length === 1 ? "" : "s"} selected.
          Zoom to level 10 or above to draw. Only small, non-overlapping polygons can be applied.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-xs">Map center latitude
            <Input className="w-32" inputMode="decimal" value={latInput} onChange={(e) => setLatInput(e.target.value)} disabled={disabled} />
          </label>
          <label className="space-y-1 text-xs">Longitude
            <Input className="w-32" inputMode="decimal" value={lonInput} onChange={(e) => setLonInput(e.target.value)} disabled={disabled} />
          </label>
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => {
            const lat = Number(latInput), lon = Number(lonInput);
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 85 || Math.abs(lon) > 180) {
              setStatus("Enter valid latitude and longitude."); return;
            }
            moveTo({ lat, lon }, 14);
          }}>Center map</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled || vertices.length === 0}
            onClick={() => { setVertices((p) => p.slice(0, -1)); setStatus(""); }}>Undo corner</Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || vertices.length === 0}
            onClick={() => { setVertices([]); setStatus(""); }}>Start new outline</Button>
          <Button type="button" size="sm" disabled={disabled || !safeShape || !pending}
            onClick={() => { onChange(safeShape!); setStatus("Area applied to your draft. Save the neighborhood page to publish it."); }}>
            Apply this area
          </Button>
          {boundary && <Button type="button" size="sm" variant="outline" disabled={disabled}
            onClick={() => { onChange(null); setVertices([]); setStatus("Custom area removed from draft. Save to use official GIS again."); }}>
            Remove custom area
          </Button>}
        </div>
        {shape && !safeShape && <p role="alert" className="text-xs text-amber-700">
          That outline is invalid, self-crossing or too large. Adjust its corners before applying.
        </p>}
        {status && <p role="status" className="text-xs text-slate-700">{status}</p>}
      </div>
    </details>
  );
}
