/**
 * Polygon zone editor — react-leaflet map + leaflet-geoman-free drawing.
 *
 * Fully controlled: receives the current polygon as `value` and emits
 * the new polygon (or null when cleared) via `onChange`. The parent owns
 * persistence (calls the backend on submit).
 *
 * UX rules enforced here:
 *   - Only polygon drawing/edit is enabled. Markers, lines, circles,
 *     rectangles, etc. are hidden so admins can't draw the wrong shape.
 *   - Only ONE polygon at a time. If the admin draws a second one, we
 *     remove the previous one — keeps the GeoJSON we send single-Polygon.
 *   - Explicit helper buttons (Draw / Edit / Clear) sit on top of the map
 *     so corner-adding is discoverable, plus a location search box so
 *     admins can jump to the building instead of panning the whole world.
 *
 * Geoman is wired up from INSIDE a child component via `useMap()` rather
 * than a map ref + `[mapRef.current]` effect — refs don't trigger renders,
 * so the old approach raced the map's creation and the draw toolbar often
 * never mounted (hence "no helpers to add corners").
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L, { type FeatureGroup as LFeatureGroup, type Layer } from "leaflet";
import "leaflet/dist/leaflet.css";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";
import type { Polygon } from "geojson";
import { Search, Loader2, Pencil, Move, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ZoneEditorMapProps {
  /** Current polygon, or null if no zone is set. */
  value: Polygon | null;
  /** Fires on draw / edit / drag / delete. `null` means the polygon was removed. */
  onChange: (next: Polygon | null) => void;
  /** Map center fallback when `value` is null. Defaults to GUC. */
  defaultCenter?: [number, number];
  /** Initial zoom when there's no polygon yet. Default 17. */
  defaultZoom?: number;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [29.9866, 31.4393]; // GUC main building
const POLYGON_STYLE = {
  color: "#2563eb",
  weight: 2,
  fillColor: "#2563eb",
  fillOpacity: 0.18,
};

export function ZoneEditorMap({
  value,
  onChange,
  defaultCenter = DEFAULT_CENTER,
  defaultZoom = 17,
  className,
}: ZoneEditorMapProps) {
  return (
    <div className={className} style={{ position: "relative" }}>
      <MapContainer
        center={value ? polygonCenter(value) : defaultCenter}
        zoom={defaultZoom}
        scrollWheelZoom
        className="size-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoneLayer value={value} onChange={onChange} />
        <MapSearch />
      </MapContainer>
    </div>
  );
}

/**
 * Imperative Geoman + polygon-sync layer. Lives inside <MapContainer> so
 * `useMap()` hands us a fully-created map — no ref races.
 */
function ZoneLayer({
  value,
  onChange,
}: {
  value: Polygon | null;
  onChange: (next: Polygon | null) => void;
}) {
  const map = useMap();
  const groupRef = useRef<LFeatureGroup | null>(null);
  // Signature of the polygon currently painted into the group. Lets the
  // value-sync effect skip redundant repaints (which would wipe in-flight
  // edits). Reset to null whenever the group is recreated (see init effect)
  // so a fresh group always gets repainted — otherwise StrictMode's dev
  // double-mount leaves the polygon invisible on first load.
  const lastSyncedRef = useRef<string | null>(null);
  // Suppress emitting onChange when WE'RE the ones who painted the layer
  // from incoming `value` — otherwise the parent flips state in a loop.
  const suppressEmitRef = useRef(false);
  // Keep the latest onChange without re-binding listeners every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // UI state mirrored from Geoman so the helper buttons can show active mode.
  const [mode, setMode] = useState<"idle" | "draw" | "edit" | "drag">("idle");

  useEffect(() => {
    map.pm.addControls({
      position: "topright",
      drawPolygon: true,
      editMode: true,
      dragMode: true,
      removalMode: true,
      // Hide everything we don't want admins to draw
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 20 });

    const group = L.featureGroup().addTo(map);
    groupRef.current = group;
    // Fresh group → force the value-sync effect to repaint into it.
    lastSyncedRef.current = null;

    const collectPolygon = (): Polygon | null => {
      const layers = group.getLayers();
      const polys = layers.filter((l): l is L.Polygon => l instanceof L.Polygon);
      if (polys.length === 0) return null;
      // Keep only the most recently created polygon — drop the rest.
      while (polys.length > 1) {
        const old = polys.shift()!;
        group.removeLayer(old);
      }
      const gj = polys[0].toGeoJSON() as GeoJSON.Feature<Polygon>;
      return gj.geometry;
    };

    const emit = () => {
      if (suppressEmitRef.current) return;
      onChangeRef.current(collectPolygon());
    };

    const onCreate = (e: { layer: Layer }) => {
      // Move the freshly drawn layer into our group so it lives alongside any pre-existing one.
      group.addLayer(e.layer);
      if (e.layer instanceof L.Polygon) e.layer.setStyle(POLYGON_STYLE);
      emit();
    };
    const onEditOrDrag = () => emit();
    const onRemove = () => emit();
    // Reflect Geoman's global mode toggles back into our button state.
    const syncMode = () => {
      if (map.pm.globalDrawModeEnabled()) setMode("draw");
      else if (map.pm.globalEditModeEnabled()) setMode("edit");
      else if (map.pm.globalDragModeEnabled()) setMode("drag");
      else setMode("idle");
    };

    map.on("pm:create", onCreate);
    map.on("pm:edit", onEditOrDrag);
    map.on("pm:drag", onEditOrDrag);
    map.on("pm:remove", onRemove);
    map.on("pm:globaldrawmodetoggled", syncMode);
    map.on("pm:globaleditmodetoggled", syncMode);
    map.on("pm:globaldragmodetoggled", syncMode);

    return () => {
      map.off("pm:create", onCreate);
      map.off("pm:edit", onEditOrDrag);
      map.off("pm:drag", onEditOrDrag);
      map.off("pm:remove", onRemove);
      map.off("pm:globaldrawmodetoggled", syncMode);
      map.off("pm:globaleditmodetoggled", syncMode);
      map.off("pm:globaldragmodetoggled", syncMode);
      map.pm.removeControls();
      group.remove();
      groupRef.current = null;
    };
  }, [map]);

  // Sync incoming `value` → painted polygon. Only redraws when the GeoJSON
  // string changes, not on every parent render (which would wipe in-flight edits).
  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;

    const serialized = value ? JSON.stringify(value) : null;
    if (serialized === lastSyncedRef.current) return;
    lastSyncedRef.current = serialized;

    suppressEmitRef.current = true;
    group.clearLayers();
    if (value) {
      const layer = L.geoJSON(value, { style: () => POLYGON_STYLE });
      layer.eachLayer((l) => group.addLayer(l));
      const bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 19 });
    }
    suppressEmitRef.current = false;
  }, [value, map]);

  // --- Helper buttons -------------------------------------------------------
  const hasPolygon = !!value;

  const startDraw = useCallback(() => {
    if (map.pm.globalDrawModeEnabled()) map.pm.disableDraw();
    else map.pm.enableDraw("Polygon", { snappable: true, snapDistance: 20 });
  }, [map]);

  const toggleEdit = useCallback(() => {
    map.pm.toggleGlobalEditMode();
  }, [map]);

  const toggleDrag = useCallback(() => {
    map.pm.toggleGlobalDragMode();
  }, [map]);

  const clearZone = useCallback(() => {
    groupRef.current?.clearLayers();
    map.pm.disableDraw();
    if (map.pm.globalEditModeEnabled()) map.pm.disableGlobalEditMode();
    if (map.pm.globalDragModeEnabled()) map.pm.disableGlobalDragMode();
    lastSyncedRef.current = null;
    onChangeRef.current(null);
  }, [map]);

  return (
    <div
      className="absolute left-3 top-3 z-[1000] flex flex-wrap items-center gap-1 rounded-md border bg-background/95 p-1 shadow-sm backdrop-blur"
      // Stop map drag/scroll from firing when interacting with the toolbar.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="sm"
        variant={mode === "draw" ? "default" : "secondary"}
        onClick={startDraw}
        title="Click on the map to drop each corner, then click the first corner (or double-click) to finish."
      >
        <Pencil className="mr-1 size-3.5" />
        {mode === "draw" ? "Click to add corners…" : hasPolygon ? "Redraw zone" : "Draw zone"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "edit" ? "default" : "ghost"}
        onClick={toggleEdit}
        disabled={!hasPolygon}
        title="Drag the corner handles to fine-tune the shape."
      >
        <Move className="mr-1 size-3.5" />
        Edit corners
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === "drag" ? "default" : "ghost"}
        onClick={toggleDrag}
        disabled={!hasPolygon}
        title="Drag the whole zone to reposition it."
      >
        Move
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={clearZone}
        disabled={!hasPolygon}
        title="Remove the zone and start over."
      >
        <Trash2 className="mr-1 size-3.5" />
        Clear
      </Button>
    </div>
  );
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: [string, string, string, string];
}

/**
 * Location search box (OpenStreetMap Nominatim). Lets admins type a place
 * name and fly the map there instead of hand-panning across the globe.
 */
function MapSearch() {
  const map = useMap();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url =
          "https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=0&q=" +
          encodeURIComponent(q);
        const res = await fetch(url, {
          signal: ctrl.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data: NominatimResult[] = await res.json();
        setResults(data);
        setOpen(true);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setResults([]);
          setOpen(false);
        }
      } finally {
        setLoading(false);
      }
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const goTo = (r: NominatimResult) => {
    const lat = parseFloat(r.lat);
    const lon = parseFloat(r.lon);
    if (r.boundingbox) {
      const [s, n, w, e] = r.boundingbox.map(parseFloat);
      map.fitBounds(
        [
          [s, w],
          [n, e],
        ],
        { padding: [20, 20], maxZoom: 18 },
      );
    } else {
      map.flyTo([lat, lon], 18);
    }
    setOpen(false);
    setQuery(r.display_name.split(",")[0]);
  };

  return (
    <div
      className="absolute right-3 top-3 z-[1000] w-64 max-w-[60%]"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="relative">
        {loading ? (
          <Loader2 className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search for a place…"
          className="bg-background/95 pl-8 shadow-sm backdrop-blur"
        />
      </div>
      {open && results.length > 0 ? (
        <ul className="mt-1 max-h-56 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
          {results.map((r) => (
            <li key={r.place_id}>
              <button
                type="button"
                onClick={() => goTo(r)}
                className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                title={r.display_name}
              >
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Cheap centroid (bbox center) — good enough to center the map on mount. */
function polygonCenter(p: Polygon): [number, number] {
  const ring = p.coordinates[0];
  let minLng = Infinity,
    maxLng = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2];
}
