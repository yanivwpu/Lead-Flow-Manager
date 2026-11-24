import { useMemo, useRef, useState, type PointerEvent, type MouseEvent } from "react";
import type { PolygonBoundary, Position } from "@shared/agent/neighborhoodListingGeo";
import { validateAgentDefinedArea } from "@shared/agent/neighborhoodCustomArea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const WIDTH = 650;
const HEIGHT = 380;
const TILE = 256;
const MAX_LAT = 85.05112878;
type Center = { lat: number; lon: number };
function clampLat(value: number) { return Math.max(-MAX_LAT, Math.min(MAX_LAT, value)); }
function project(point: Center, zoom: number) {
  const size = TILE * Math.pow(2, zoom);
  const lat = clampLat(point.lat) * Math.PI / 180;
  return {
    x: (point.lon + 180) / 360 * size,
    y: (1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * size,
  };
}
function unproject(x: number, y: number, zoom: number): Center {
  const size = TILE * Math.pow(2, zoom);
  return {
    lon: Math.max(-180, Math.min(180, x / size * 360 - 180)),
    lat: clampLat(Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI),
  };
}
function initialCenter(boundary: PolygonBoundary | null | undefined, country: string): Center {
  const points = boundary?.coordinates?.[0]?.slice(0, -1);
  if (points?.length) return {
    lon: points.reduce((sum, point) => sum + point[0], 0) / points.length,
    lat: points.reduce((sum, point) => sum + point[1], 0) / points.length,
  };
  return country === "US" ? { lat: 26.12, lon: -80.14 } : { lat: 15, lon: 0 };
}

/**
 * Dependency-free, owner-only raster map editor; its OSM tiles are background
 * visualization, not proof of a boundary. Supports mouse, touch and keyboard
 * coordinate entry. Only validated explicit polygons are submitted.
 */
export function NeighborhoodBoundaryMap(props: {
  country: string;
  boundary?: PolygonBoundary | null;
  disabled: boolean;
  onChange: (next: PolygonBoundary | null) => void;
}) {
  const [center, setCenter] = useState<Center>(() => initialCenter(props.boundary, props.country));
  const [zoom, setZoom] = useState(props.boundary ? 14 : props.country === "US" ? 11 : 2);
  const [mode, setMode] = useState<"move" | "draw">("move");
  const [vertices, setVertices] = useState<Position[]>(() =>
    props.boundary?.coordinates?.[0]?.slice(0, -1) ?? []);
  const [message, setMessage] = useState("");
  const centerLatRef = useRef<HTMLInputElement>(null);
  const centerLonRef = useRef<HTMLInputElement>(null);
  const pointLatRef = useRef<HTMLInputElement>(null);
  const pointLonRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<{ x: number; y: number; center: Center } | null>(null);

  const map = useMemo(() => {
    const centerPx = project(center, zoom);
    const left = centerPx.x - WIDTH / 2;
    const top = centerPx.y - HEIGHT / 2;
    const max = 2 ** zoom;
    const tiles: Array<{ key: string; src: string; left: number; top: number }> = [];
    for (let tx = Math.floor(left / TILE); tx <= Math.floor((left + WIDTH) / TILE); tx++) {
      for (let ty = Math.floor(top / TILE); ty <= Math.floor((top + HEIGHT) / TILE); ty++) {
        if (ty < 0 || ty >= max) continue;
        const wrappedX = ((tx % max) + max) % max;
        tiles.push({
          key: tx + ":" + ty,
          src: "https://tile.openstreetmap.org/" + zoom + "/" + wrappedX + "/" + ty + ".png",
          left: tx * TILE - left,
          top: ty * TILE - top,
        });
      }
    }
    const path = vertices.map(([lon, lat]) => {
      const pixel = project({ lon, lat }, zoom);
      return { x: pixel.x - left, y: pixel.y - top };
    });
    return { tiles, path, left, top };
  }, [center, zoom, vertices]);

  const currentShape = useMemo(() => {
    if (vertices.length < 3) return null;
    return validateAgentDefinedArea({
      type: "Polygon", coordinates: [[...vertices, vertices[0]]],
    });
  }, [vertices]);

  function addPoint(lat: number, lon: number) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > MAX_LAT || Math.abs(lon) > 180) {
      setMessage("Enter valid latitude and longitude values."); return;
    }
    if (vertices.length >= 120) { setMessage("Maximum of 120 corner points."); return; }
    setVertices((current) => [...current, [Number(lon.toFixed(7)), Number(lat.toFixed(7))]]);
    setMessage("Corner added. Add at least three points, then use this outline.");
  }
  function onMapClick(event: MouseEvent<HTMLDivElement>) {
    if (props.disabled || mode !== "draw") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) * WIDTH / rect.width;
    const y = (event.clientY - rect.top) * HEIGHT / rect.height;
    const geo = unproject(map.left + x, map.top + y, zoom);
    addPoint(geo.lat, geo.lon);
  }
  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (props.disabled || mode !== "move") return;
    dragRef.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragRef.current;
    if (!start || props.disabled || mode !== "move") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = (event.clientX - start.x) * WIDTH / rect.width;
    const dy = (event.clientY - start.y) * HEIGHT / rect.height;
    const px = project(start.center, zoom);
    setCenter(unproject(px.x - dx, px.y - dy, zoom));
  }
  function jumpToCenter() {
    const lat = Number(centerLatRef.current?.value);
    const lon = Number(centerLonRef.current?.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > MAX_LAT || Math.abs(lon) > 180) {
      setMessage("Enter valid coordinates for the map center."); return;
    }
    setCenter({ lat, lon });
    setZoom((old) => Math.max(old, 12));
    setMessage("Map centered. Switch to Draw outline to add corners.");
  }
  function setCurrentLocation() {
    if (!navigator.geolocation) { setMessage("Location is not available on this device."); return; }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setCenter({ lat: coords.latitude, lon: coords.longitude }); setZoom(13); },
      () => setMessage("Location permission was not granted. You can enter coordinates instead."),
      { timeout: 7000, enableHighAccuracy: false },
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3" aria-label="Agent-defined service area editor">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm text-slate-800">Your own service area</strong>
        <span className="text-xs text-slate-600">Not an official neighborhood boundary</span>
      </div>
      <p className="text-xs leading-5 text-slate-600">
        Optional. Move and zoom the map, then choose Draw outline and click or tap around the area.
        The outline will only be saved when you update the neighborhood page.
        A verified city boundary always takes priority.
      </p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Map tools">
        <Button type="button" size="sm" variant={mode === "move" ? "default" : "outline"}
          disabled={props.disabled} onClick={() => setMode("move")}>Move map</Button>
        <Button type="button" size="sm" variant={mode === "draw" ? "default" : "outline"}
          disabled={props.disabled} onClick={() => setMode("draw")}>Draw outline</Button>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled || zoom >= 17}
          aria-label="Zoom in map" onClick={() => setZoom((z) => Math.min(17, z + 1))}>+</Button>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled || zoom <= 2}
          aria-label="Zoom out map" onClick={() => setZoom((z) => Math.max(2, z - 1))}>−</Button>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled}
          onClick={setCurrentLocation}>Use my location</Button>
      </div>
      <div className="relative w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-100 select-none"
        role="application" aria-label="Neighborhood map: use Move map or Draw outline buttons"
        style={{ aspectRatio: WIDTH + "/" + HEIGHT, cursor: mode === "draw" ? "crosshair" : "grab", touchAction: "none" }}
        onClick={onMapClick} onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        {map.tiles.map((tile) => (
          <img key={tile.key} src={tile.src} alt="" draggable={false}
            decoding="async" loading="lazy" referrerPolicy="no-referrer"
            style={{ position: "absolute", left: tile.left / WIDTH * 100 + "%",
              top: tile.top / HEIGHT * 100 + "%", width: TILE / WIDTH * 100 + "%",
              height: TILE / HEIGHT * 100 + "%", pointerEvents: "none" }} />
        ))}
        <svg viewBox={"0 0 " + WIDTH + " " + HEIGHT} aria-hidden="true" preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
          {map.path.length > 1 && <polyline points={map.path.map((p) => p.x + "," + p.y).join(" ")}
            stroke="#047857" strokeWidth="3" fill="none" />}
          {map.path.length > 2 && <polygon points={map.path.map((p) => p.x + "," + p.y).join(" ")}
            stroke="#047857" strokeWidth="2" fill="#059669" fillOpacity=".13" />}
          {map.path.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={5} fill="#047857"
            stroke="#ffffff" strokeWidth={2} />)}
        </svg>
        <span className="absolute bottom-1 right-1 rounded bg-white/95 px-1 text-[10px] text-slate-700">
          © OpenStreetMap contributors
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" aria-label="Map center coordinates">
        <div><Label htmlFor="area-center-lat">Map center latitude</Label>
          <Input key={"lat-" + center.lat.toFixed(5)} id="area-center-lat" ref={centerLatRef}
            type="number" step=".00001" defaultValue={center.lat.toFixed(5)} disabled={props.disabled} /></div>
        <div><Label htmlFor="area-center-lon">Map center longitude</Label>
          <Input key={"lon-" + center.lon.toFixed(5)} id="area-center-lon" ref={centerLonRef}
            type="number" step=".00001" defaultValue={center.lon.toFixed(5)} disabled={props.disabled} /></div>
        <Button type="button" variant="outline" disabled={props.disabled}
          className="self-end" onClick={jumpToCenter}>Go to coordinates</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" aria-label="Add corner by coordinates">
        <div><Label htmlFor="area-corner-lat">Corner latitude (keyboard option)</Label>
          <Input ref={pointLatRef} id="area-corner-lat" type="number" step=".000001"
            disabled={props.disabled} placeholder="e.g. 26.123456" /></div>
        <div><Label htmlFor="area-corner-lon">Corner longitude</Label>
          <Input ref={pointLonRef} id="area-corner-lon" type="number" step=".000001"
            disabled={props.disabled} placeholder="e.g. -80.145678" /></div>
        <Button type="button" variant="outline" disabled={props.disabled}
          className="self-end" onClick={() => addPoint(Number(pointLatRef.current?.value), Number(pointLonRef.current?.value))}>
          Add corner
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={props.disabled || !vertices.length}
          onClick={() => setVertices((old) => old.slice(0, -1))}>Undo last corner</Button>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled || !vertices.length}
          onClick={() => { setVertices([]); setMessage(""); }}>Start over</Button>
        <Button type="button" size="sm" disabled={props.disabled || !currentShape}
          onClick={() => {
            if (!currentShape) return;
            props.onChange(currentShape);
            setMessage("Outline added to your page draft. Click Save draft or Update published page to keep it.");
          }}>Use this outline</Button>
        <Button type="button" size="sm" variant="outline" disabled={props.disabled || !props.boundary}
          onClick={() => { setVertices([]); props.onChange(null); setMessage("Saved outline marked for removal. Save your page to confirm."); }}>
          Remove saved area
        </Button>
      </div>
      <p className="text-xs text-slate-600" role="status">
        {message || (currentShape ? "Outline valid — " + vertices.length + " corners" :
          vertices.length < 3 ? "Add at least 3 corners to draw a service area." :
          "Outline invalid: use a small, simple non-crossing local polygon (under 0.5° wide).")}
      </p>
    </div>
  );
}
